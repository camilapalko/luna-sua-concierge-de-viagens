import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Check, Sparkles, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { LunaLogo } from "@/components/LunaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  INTAKE_QUESTIONS,
  previousQuestionIndex,
  profileSummary,
  formatAnswer,
  visibleQuestions,
  toggleMultiOption,
  type Answers,
} from "@/lib/intake";
import { createTrip } from "@/lib/trips.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { parseQuickStart } from "@/lib/quick-start.functions";
import { useSession } from "@/hooks/useSession";

// Atalhos pra quem ja sabe o que quer e nao quer responder pergunta por
// pergunta -- ficam escondidos atras de um link opcional (ver
// QuickStartPanel), pra nao poluir a tela de quem prefere o fluxo normal.
// Cada chip preenche de uma vez varios campos do intake (os mesmos que o
// modo "conte com suas palavras" tenta extrair via IA em quick-start.functions.ts),
// e o fluxo pula direto pra proxima pergunta que ainda falta responder.
const QUICK_START_PRESETS: Array<{ label: string; answers: Answers }> = [
  {
    label: "Lua de mel romântica",
    answers: {
      service_type: "Viagem Completa",
      travelers: "Em casal",
      budget: "Luxo",
      interests: ["Gastronomia", "Relaxamento"],
    },
  },
  {
    label: "Mochilão econômico",
    answers: {
      service_type: "Viagem Completa",
      travelers: "Sozinho(a)",
      budget: "Econômico",
      interests: ["Natureza & Aventura", "Cultura & História"],
    },
  },
  {
    label: "Praia em família",
    answers: {
      service_type: "Viagem Completa",
      destination: "Nordeste Brasileiro",
      travelers: "Família",
      budget: "Moderado",
      interests: ["Relaxamento"],
    },
  },
  {
    label: "Fim de semana com amigos",
    answers: {
      service_type: "Viagem Completa",
      travelers: "Amigos",
      budget: "Moderado",
      interests: ["Vida Noturna", "Gastronomia"],
    },
  },
];

const STORAGE_KEY = "luna:intake-pendente";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Planejar viagem com a Luna" },
      {
        name: "description",
        content:
          "Responda algumas perguntas e a Luna monta um roteiro personalizado para a sua próxima viagem.",
      },
      { property: "og:title", content: "Planejar viagem com a Luna" },
      {
        property: "og:description",
        content: "Conte seus desejos de viagem e receba um roteiro sob medida.",
      },
    ],
  }),
  component: ChatPage,
});

// nextQuestionIndex (de @/lib/intake) so pula perguntas ESCONDIDAS pela
// condicao `skip` -- ele nao verifica se a pergunta ja tem resposta. Isso
// funciona bem no fluxo normal (uma pergunta de cada vez, sempre em ordem),
// mas quebra quando varias respostas sao preenchidas de uma vez fora de
// ordem (perfil salvo ou os atalhos de inicio rapido abaixo): a tela ficava
// presa mostrando de novo a primeira pergunta, mesmo ja tendo uma resposta
// pra ela. Esta versao pula tanto as escondidas quanto as ja respondidas.
function nextUnansweredIndex(answers: Answers): number {
  for (let i = 0; i < INTAKE_QUESTIONS.length; i++) {
    const q = INTAKE_QUESTIONS[i]!;
    if (q.skip?.(answers)) continue;
    if (answers[q.id] === undefined) return i;
  }
  return INTAKE_QUESTIONS.length;
}

function ChatPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [textValue, setTextValue] = useState("");
  const [multi, setMulti] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [usedProfileDefaults, setUsedProfileDefaults] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [parsingQuickText, setParsingQuickText] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const profileApplied = useRef(false);

  const fetchProfile = useServerFn(getMyProfile);
  const parseQuickStartText = useServerFn(parseQuickStart);
  const profileQuery = useQuery({
    queryKey: ["my-profile", session?.user.id],
    queryFn: () => fetchProfile(),
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  const question = INTAKE_QUESTIONS[index];
  const total = visibleQuestions(answers).length;
  const answeredCount = Object.keys(answers).length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [index]);

  // Pré-preenche com as preferências salvas em "Meu perfil" (companhia
  // aérea, restrições alimentares, hospedagem, ritmo) numa viagem nova —
  // assim quem já tem um perfil não precisa responder tudo de novo toda
  // vez. Só roda uma vez, só se o intake ainda estiver no começo (evita
  // atropelar quem já está respondendo, ou o fluxo de retomada pós-login,
  // que tem prioridade e é tratado no efeito de STORAGE_KEY abaixo).
  useEffect(() => {
    if (profileApplied.current) return;
    if (!profileQuery.data) return;
    if (index !== 0 || Object.keys(answers).length > 0) return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;

    const { defaults, milesPrograms } = profileQuery.data;
    const hasDefaults = Object.keys(defaults).length > 0;
    const hasMiles = milesPrograms.length > 0;
    if (!hasDefaults && !hasMiles) return;

    profileApplied.current = true;
    const merged: Answers = { ...defaults, __hasMiles: hasMiles ? "yes" : "no" };
    setAnswers(merged);
    setIndex(nextUnansweredIndex(merged));
    setUsedProfileDefaults(true);
  }, [profileQuery.data, index, answers]);

  function ignoreProfileDefaults() {
    profileApplied.current = true;
    setUsedProfileDefaults(false);
    setAnswers({});
    setIndex(0);
  }

  // Usada tanto pelos chips de ideia pronta quanto pelo modo "conte com suas
  // palavras" (depois da IA extrair o que der) -- as duas formas de atalho
  // convergem pra essa mesma funcao, preenchendo varias respostas de uma vez
  // e pulando direto pra proxima pergunta que ainda falta.
  function applyQuickStart(partial: Answers) {
    if (Object.keys(partial).length === 0) return;
    profileApplied.current = true;
    const merged: Answers = { ...answers, ...partial };
    setAnswers(merged);
    setIndex(nextUnansweredIndex(merged));
    setQuickStartOpen(false);
    setQuickText("");
  }

  async function submitQuickText() {
    const text = quickText.trim();
    if (!text) return;
    setParsingQuickText(true);
    try {
      const partial = await parseQuickStartText({ data: { text } });
      if (Object.keys(partial).length === 0) {
        toast.error(
          "Não consegui identificar nada certeiro nessa descrição — tente uma ideia pronta ou responda as perguntas normalmente.",
        );
        return;
      }
      applyQuickStart(partial as Answers);
    } catch {
      toast.error("Não consegui processar agora. Tente de novo.");
    } finally {
      setParsingQuickText(false);
    }
  }

  const finish = useCallback(
    async (finalAnswers: Answers) => {
      if (submitted.current) return;
      submitted.current = true;

      if (!session) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(finalAnswers));
        void navigate({ to: "/auth", search: { redirect: "/chat" } });
        return;
      }

      setCreating(true);
      try {
        const { tripId } = await createTrip({
          data: {
            destination: String(finalAnswers["destination"] ?? "Destino a definir"),
            origin: finalAnswers["origin"] ? String(finalAnswers["origin"]) : null,
            profile: finalAnswers as Record<string, string | string[]>,
            firstMessage: profileSummary(finalAnswers, profileQuery.data?.milesPrograms ?? []),
          },
        });
        void navigate({ to: "/minhas-viagens/$tripId", params: { tripId } });
      } catch (error) {
        submitted.current = false;
        setCreating(false);
        toast.error(error instanceof Error ? error.message : "Não consegui criar sua viagem.");
      }
    },
    [navigate, session, profileQuery.data],
  );

  // Retoma o intake respondido antes do login. Importante: remove a chave do
  // localStorage IMEDIATAMENTE ao ler, antes de criar a viagem — se essa tela
  // rodar em duas abas ou recarregar no meio do fluxo de login, isso evita
  // que a mesma viagem seja criada duas vezes (o que já aconteceu).
  useEffect(() => {
    if (loading || !session || submitted.current) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    window.localStorage.removeItem(STORAGE_KEY);
    try {
      void finish(JSON.parse(stored) as Answers);
    } catch {
      // já removido acima, nada mais a fazer
    }
  }, [loading, session, finish]);

  function answer(value: string | string[]) {
    if (!question) return;
    const next: Answers = { ...answers, [question.id]: value };
    setAnswers(next);
    setTextValue("");
    setMulti([]);
    setStart("");
    setEnd("");
    // Usa nextUnansweredIndex (nao o nextQuestionIndex puro) pra tambem
    // pular perguntas que ja tenham resposta -- isso importa quando um chip
    // de inicio rapido, o perfil salvo, ou um "Voltar" deixou respostas
    // preenchidas mais a frente na fila. Sem isso, a tela voltava a exibir
    // como "pendente" uma pergunta que a pessoa (ou o atalho) ja respondeu,
    // contrariando a mesma regra que o prompt da Luna segue no chat: nunca
    // repetir uma pergunta que ja foi respondida.
    const nextIndex = nextUnansweredIndex(next);
    setIndex(nextIndex);
    if (nextIndex >= INTAKE_QUESTIONS.length) void finish(next);
  }

  // Deixa corrigir uma resposta anterior sem precisar recomeçar o intake
  // inteiro do zero. Pré-preenche o campo com o que já foi respondido antes
  // (quando dá pra fazer isso de forma simples) pra ficar fácil só confirmar
  // de novo ou ajustar.
  function goBack() {
    if (index <= 0) return;
    const prevIndex = previousQuestionIndex(answers, index - 1);
    const prevQuestion = INTAKE_QUESTIONS[prevIndex];
    setTextValue("");
    setMulti([]);
    setStart("");
    setEnd("");
    if (prevQuestion) {
      const existing = answers[prevQuestion.id];
      if (prevQuestion.type === "text" && typeof existing === "string") setTextValue(existing);
      if (prevQuestion.type === "multi" && Array.isArray(existing)) setMulti(existing);
    }
    setIndex(prevIndex);
  }

  const done = index >= INTAKE_QUESTIONS.length;

  return (
    <div className="min-h-screen bg-luna">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        {usedProfileDefaults && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Já preenchi algumas respostas com as
              preferências do seu{" "}
              <Link to="/perfil" className="underline underline-offset-2">
                perfil
              </Link>
              .
            </span>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={ignoreProfileDefaults}>
              <X className="mr-1 size-3.5" /> Não usar nesta viagem
            </Button>
          </div>
        )}
        <Progress
          value={total ? Math.min(100, (answeredCount / total) * 100) : 0}
          className="mb-8 h-1.5"
        />

        <div className="space-y-6">
          {INTAKE_QUESTIONS.slice(0, index).map((q) =>
            answers[q.id] === undefined ? null : (
              <div key={q.id} className="space-y-3">
                <LunaBubble text={q.prompt} />
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
                    {formatAnswer(answers[q.id])}
                  </p>
                </div>
              </div>
            ),
          )}

          {question && !done && (
            <div className="space-y-4">
              {index > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 text-muted-foreground"
                  onClick={goBack}
                >
                  <ArrowLeft className="mr-1 size-3.5" /> Voltar
                </Button>
              )}
              {index === 0 && !usedProfileDefaults && (
                <QuickStartPanel
                  open={quickStartOpen}
                  onToggle={() => setQuickStartOpen((v) => !v)}
                  onPickPreset={applyQuickStart}
                  quickText={quickText}
                  onQuickTextChange={setQuickText}
                  onSubmitText={submitQuickText}
                  loading={parsingQuickText}
                />
              )}

              <LunaBubble text={question.prompt} />

              {question.type === "single" && (
                <ChipRow options={question.options ?? []} onPick={(value) => answer(value)} />
              )}

              {question.type === "multi" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {(question.options ?? []).map((option) => {
                      const active = multi.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setMulti((prev) => toggleMultiOption(question.id, prev, option))
                          }
                          className={`rounded-full border px-4 py-2 text-sm transition ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card hover:bg-secondary"
                          }`}
                        >
                          {active && <Check className="mr-1 inline size-3.5" />}
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    className="rounded-xl"
                    disabled={multi.length === 0}
                    onClick={() => answer(multi)}
                  >
                    Continuar
                  </Button>
                </div>
              )}

              {question.type === "text" && (
                <div className="space-y-3">
                  <ChipRow
                    options={question.suggestions ?? []}
                    onPick={(value) => answer(value)}
                    subtle
                  />
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!textValue.trim()) return;
                      answer(textValue.trim());
                    }}
                  >
                    <Input
                      value={textValue}
                      onChange={(event) => setTextValue(event.target.value)}
                      placeholder={question.placeholder ?? "Escreva aqui"}
                      className="rounded-xl"
                      autoFocus
                    />
                    <Button type="submit" className="rounded-xl" disabled={!textValue.trim()}>
                      Enviar
                    </Button>
                  </form>
                </div>
              )}

              {question.type === "dates" && (
                <div className="card-luna flex flex-wrap items-end gap-3 p-4">
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Ida</span>
                    <Input
                      type="date"
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                      className="rounded-xl"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted-foreground">Volta</span>
                    <Input
                      type="date"
                      value={end}
                      onChange={(event) => setEnd(event.target.value)}
                      className="rounded-xl"
                    />
                  </label>
                  <Button
                    className="rounded-xl"
                    disabled={!start || !end}
                    onClick={() => answer(`${formatDate(start)} a ${formatDate(end)}`)}
                  >
                    Confirmar datas
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => answer("Datas ainda não definidas")}
                  >
                    Ainda não sei
                  </Button>
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="card-luna flex items-center gap-3 p-6">
              {creating ? (
                <Loader2 className="size-5 animate-spin text-primary" />
              ) : (
                <LunaLogo size={36} />
              )}
              <p className="text-sm text-muted-foreground">
                {session
                  ? "Perfeito! Estou organizando tudo e já começo o seu planejamento…"
                  : "Só falta entrar na sua conta para eu salvar essa viagem e continuar."}
              </p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>
    </div>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function LunaBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <LunaLogo size={32} className="mt-1 shrink-0" />
      <p className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        {text}
      </p>
    </div>
  );
}

// Painel opcional de atalho: fica escondido atras de um link, so aparece na
// primeira pergunta, e some assim que a pessoa usa um dos dois caminhos --
// combina os "chips de ideia pronta" (instantaneo, sem IA) com o "conte com
// suas palavras" (texto livre, interpretado por IA em quick-start.functions.ts)
// no mesmo espaco compacto, pra nao duplicar UI nem poluir a tela de quem
// prefere so responder as perguntas normalmente.
function QuickStartPanel({
  open,
  onToggle,
  onPickPreset,
  quickText,
  onQuickTextChange,
  onSubmitText,
  loading,
}: {
  open: boolean;
  onToggle: () => void;
  onPickPreset: (answers: Answers) => void;
  quickText: string;
  onQuickTextChange: (value: string) => void;
  onSubmitText: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="text-xs font-medium text-primary hover:underline underline-offset-2"
      >
        {open ? "Prefiro responder as perguntas" : "✨ Já sei o que eu quero, quero ir direto ao ponto"}
      </button>
      {open && (
        <div className="card-luna mt-3 space-y-3 p-4">
          <p className="text-xs text-muted-foreground">
            Escolha uma ideia pra começar mais rápido, ou descreva com suas palavras:
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_START_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onPickPreset(preset.answers)}
                className="rounded-full border border-dashed border-border bg-background px-4 py-2 text-sm transition hover:bg-secondary"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitText();
            }}
          >
            <Input
              value={quickText}
              onChange={(event) => onQuickTextChange(event.target.value)}
              placeholder="Ex.: lua de mel de 5 dias em Paris, orçamento alto, focada em gastronomia"
              className="rounded-xl"
              disabled={loading}
            />
            <Button type="submit" className="rounded-xl" disabled={!quickText.trim() || loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Usar"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function ChipRow({
  options,
  onPick,
  subtle,
}: {
  options: string[];
  onPick: (value: string) => void;
  subtle?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className={`rounded-full border px-4 py-2 text-sm transition hover:bg-secondary ${
            subtle ? "border-dashed border-border bg-background" : "border-border bg-card"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
