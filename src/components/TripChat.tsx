import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, AlertCircle, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { ItineraryView } from "@/components/ItineraryView";
import { LunaLogo } from "@/components/LunaLogo";
import { SwipeFlow } from "@/components/SwipeFlow";
import { isItineraryMessage, parseItinerary } from "@/lib/itinerary";
import { supabase } from "@/integrations/supabase/client";
import { upgradeTripToComplete } from "@/lib/trip-upsell.functions";
import { updateTripStatus, type MessageRow, type TripRow } from "@/lib/trips.functions";
import { cn } from "@/lib/utils";

type ChatMessage = Pick<MessageRow, "role" | "content"> & {
  id?: string;
  error?: boolean;
  retryOf?: string;
};

// Depois de quanto tempo "pensando" mostramos um aviso extra de paciência.
// Respostas normais chegam bem antes disso; isso só aparece quando a Luna
// está numa rodada de continuação automática (resposta grande, cortada pelo
// limite de tokens do modelo) ou a API está mais lenta que o normal.
const SLOW_RESPONSE_HINT_MS = 8000;

// Cidades da viagem para o deslizar: a rota escolhida no questionario, ou os
// lugares que a pessoa digitou. Sem nenhuma dessas, devolve null (destino
// amplo demais: a Luna ainda precisa definir a rota na conversa).
function tripCities(profile: TripRow["profile"] | null | undefined): string[] | null {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const route = str(profile?.["route_choice"]);
  const specifics = str(profile?.["destination_specifics"]);
  const ignored = ["Pode montar a rota pra mim", "Já sei quais lugares quero visitar"];
  const raw = route || (ignored.includes(specifics) ? "" : specifics);
  const list = raw
    .split(/\s*(?:\+|,|;|\be\b|\/)\s*/i)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);
  return list.length > 0 ? list : null;
}

export function TripChat({
  trip,
  initialMessages,
  onMessagesChange,
}: {
  trip: TripRow;
  initialMessages: MessageRow[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const cities = useMemo(() => tripCities(trip.profile), [trip.profile]);
  // Viagem nova so de passeios com rota definida: abre o deslizar ANTES da
  // primeira resposta da Luna (a pessoa pode pular).
  const [gate, setGate] = useState(
    () =>
      !!tripCities(trip.profile) &&
      trip.profile?.["service_type"] === "Apenas Passeios" &&
      initialMessages.length === 1 &&
      initialMessages[0]?.role === "user",
  );
  const [upsellHandled, setUpsellHandled] = useState(false);
  const upgrade = useServerFn(upgradeTripToComplete);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const markFinished = useServerFn(updateTripStatus);
  const queryClient = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    if (!busy) {
      setShowSlowHint(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowHint(true), SLOW_RESPONSE_HINT_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  // Índice da PRIMEIRA mensagem com o roteiro completo. É essa que merece o
  // "reveal" grande (ItineraryView cheio) — qualquer roteiro completo que
  // apareça DEPOIS dela é uma reemissão por causa de uma edição pós-
  // finalização (ver REGRA CRÍTICA #3 do prompt), e mostrar o card gigante
  // de novo a cada pequeno ajuste ("troca só o hotel do Dia 3") é barulho
  // demais. Essas reemissões viram uma confirmação compacta em vez disso —
  // a aba "Viagem" já é atualizada por trás, então nada de informação se
  // perde, só o chat fica mais limpo.
  const firstItineraryIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant" && isItineraryMessage(m.content)),
    [messages],
  );

  const send = useCallback(
    async (message?: string, options?: { skipPush?: boolean }) => {
      setBusy(true);
      if (message && !options?.skipPush) {
        setMessages((prev) => [...prev, { role: "user", content: message }]);
      }
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Sua sessão expirou. Entre novamente.");

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tripId: trip.id, message }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          content?: string;
          truncated?: boolean;
          debug?: { finishReason?: string; usage?: Record<string, number> };
        };

        if (!res.ok || !payload.content) {
          throw new Error(payload.error ?? "A Luna não conseguiu responder agora.");
        }

        const full = payload.content;
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
        if (payload.truncated) {
          const usage = payload.debug?.usage;
          const usageText = usage
            ? ` (tokens: ${usage["completion_tokens"] ?? "?"} de saída, ${usage["prompt_tokens"] ?? "?"} de entrada)`
            : "";
          toast.warning(
            `Resposta pode ter ficado incompleta. Motivo: ${payload.debug?.finishReason ?? "desconhecido"}${usageText}`,
            { duration: 15000 },
          );
        }
        // Recarrega a viagem do banco: sem isso, a aba "Viagem" pode continuar
        // usando os dados carregados antes dessa resposta (por exemplo, se o
        // usuário trocar de aba e voltar, o chat remonta com os dados antigos
        // e "esconde" o roteiro recém-gerado até um refresh manual).
        void queryClient.invalidateQueries({ queryKey: ["trip", trip.id] });
        if (isItineraryMessage(full)) {
          // Chama sempre que a resposta tiver o roteiro completo — mesmo se a
          // viagem já estava "finalizada" antes (edição pós-finalização) —
          // porque também precisamos atualizar itinerary_content com a nova
          // versão, não só o status.
          markFinished({
            data: { tripId: trip.id, status: "finalizada", itineraryContent: full },
          }).catch(() => {
            // silencioso: o roteiro já foi entregue, só o status/link compartilhado ficariam desatualizados
          });
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : "Erro ao falar com a Luna.";
        toast.error(text);
        // Além do toast (que pode passar despercebido), deixa um aviso visível
        // dentro da própria conversa, com a opção de tentar de novo sem
        // precisar redigitar a mensagem original.
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: text, error: true, ...(message ? { retryOf: message } : {}) },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [trip.id, markFinished, queryClient],
  );

  const hasItinerary = firstItineraryIndex >= 0;
  const showUpsell =
    hasItinerary &&
    !upsellHandled &&
    !busy &&
    trip.profile?.["service_type"] === "Apenas Passeios";

  const handleUpsell = useCallback(
    async (kind: "hospedagem" | "voos" | "ambos") => {
      setUpsellHandled(true);
      try {
        await upgrade({ data: { tripId: trip.id } });
      } catch (error) {
        setUpsellHandled(false);
        toast.error(error instanceof Error ? error.message : "Não consegui atualizar a viagem.");
        return;
      }
      const what =
        kind === "hospedagem"
          ? "sugestões de hospedagem"
          : kind === "voos"
            ? "opções de voo"
            : "sugestões de hospedagem e opções de voo";
      const ask =
        kind === "hospedagem"
          ? "tipo de hospedagem"
          : kind === "voos"
            ? "cidade de origem e horário preferido"
            : "tipo de hospedagem, cidade de origem e horário de voo preferido";
      void send(
        `Quero também ${what} para esses passeios. Pergunte só as preferências que ainda faltam (${ask}) e depois atualize o roteiro completo incluindo essas seções e os links de reserva.`,
      );
    },
    [upgrade, trip.id, send],
  );

  const finishSwipe = useCallback(
    (liked: string[]) => {
      setSwipeOpen(false);
      const msg = `Escolhi estas atrações deslizando e quero que o roteiro priorize todas elas: ${liked.join("; ")}. Monte AGORA o roteiro completo no formato final (cabeçalho e todas as seções), sem me fazer perguntas e sem propor a divisão dos dias para eu confirmar. Se o mês não estiver definido, assuma uma época neutra e me avise no final.`;
      if (gate) {
        started.current = true;
        setGate(false);
        if (liked.length > 0) void send(msg);
        else void send();
      } else if (liked.length > 0) {
        void send(msg);
      }
    },
    [gate, send],
  );

  const retry = useCallback(
    (message: string) => {
      void send(message, { skipPush: true });
    },
    [send],
  );

  useEffect(() => {
    if (started.current) return;
    if (gate) return;
    const last = initialMessages[initialMessages.length - 1];
    if (last && last.role === "user") {
      started.current = true;
      void send();
    }
  }, [initialMessages, send, gate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pt-5 pb-6 sm:px-6">
        {messages.map((message, index) => (
          <Bubble
            key={message.id ?? index}
            role={message.role}
            content={message.content}
            error={message.error}
            retryOf={message.retryOf}
            onRetry={retry}
            isFirstItinerary={index === firstItineraryIndex}
          />
        ))}
        {busy && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LunaLogo size={28} />
              <span className="flex gap-1">
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </span>
            </div>
            {showSlowHint && (
              <p className="ml-9 text-xs text-muted-foreground/80">
                Roteiros grandes podem levar um pouco mais — já estou nisso.
              </p>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/70 bg-background/80 px-4 pb-4 pt-4 sm:px-6">
        {showUpsell && (
          <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-medium">Quer que eu complete sua viagem?</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Posso sugerir onde ficar e opções de voo para esses passeios.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["hospedagem", "Sugerir hospedagem"],
                  ["voos", "Ver opções de voo"],
                  ["ambos", "Os dois"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  className="rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                  onClick={() => void handleUpsell(kind)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="rounded-full px-3 py-1.5 text-xs text-muted-foreground underline"
                onClick={() => setUpsellHandled(true)}
              >
                Agora não
              </button>
            </div>
          </div>
        )}
        {(swipeOpen || gate) && (
          <div className="mb-3">
            <SwipeFlow
              cities={cities ?? [trip.destination]}
              interests={Array.isArray(trip.profile?.["interests"]) ? (trip.profile["interests"] as string[]) : []}
              days={typeof trip.profile?.["trip_duration"] === "string" ? (trip.profile["trip_duration"] as string) : ""}
              onCancel={() => finishSwipe([])}
              onDone={finishSwipe}
            />
          </div>
        )}
        {!swipeOpen && !gate && !busy && !messages.some((m) => m.role === "assistant" && isItineraryMessage(m.content)) && (
          <button
            type="button"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            onClick={() => setSwipeOpen(true)}
          >
            <Sparkles className="size-3.5" /> Escolher atrações deslizando (opcional)
          </button>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (!value || busy) return;
            setDraft("");
            void send(value);
          }}
        >
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const value = draft.trim();
                if (!value || busy) return;
                setDraft("");
                void send(value);
              }
            }}
            placeholder="Escreva para a Luna…"
            rows={2}
            className="min-h-[56px] resize-none rounded-2xl"
          />
          <Button type="submit" size="icon" className="size-11 rounded-2xl" disabled={busy}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block size-2 animate-bounce rounded-full bg-primary/60"
      style={{ animationDelay: delay }}
    />
  );
}

export function Bubble({
  role,
  content,
  error,
  retryOf,
  onRetry,
  isFirstItinerary = true,
}: {
  role: "user" | "assistant";
  content: string;
  error?: boolean | undefined;
  retryOf?: string | undefined;
  onRetry?: (message: string) => void;
  isFirstItinerary?: boolean;
}) {
  if (role === "assistant" && isItineraryMessage(content)) {
    if (!isFirstItinerary) {
      return (
        <div className="flex gap-3">
          <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-4" />
          </span>
          <div className="max-w-[85%] rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            Roteiro atualizado com essa mudança — já está refletido na aba{" "}
            <span className="font-semibold">Viagem</span>.
          </div>
        </div>
      );
    }
    return <ItineraryView itinerary={parseItinerary(content)} />;
  }

  if (error) {
    return (
      <div className="flex gap-3">
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-4" />
        </span>
        <div className="max-w-[85%] space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p>{content}</p>
          {retryOf && onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => onRetry(retryOf)}
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Tentar novamente
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", role === "user" ? "justify-end" : "justify-start")}>
      {role === "assistant" && <LunaLogo size={32} className="mt-1 shrink-0" />}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-card-foreground",
        )}
      >
        {role === "user" ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <Markdown content={content} />
        )}
      </div>
      {role === "user" && (
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Sparkles className="size-4" />
        </span>
      )}
    </div>
  );
}
