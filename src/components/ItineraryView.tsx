import { useEffect, useMemo, useState } from "react";
import {
  Plane,
  UtensilsCrossed,
  Camera,
  Car,
  BedDouble,
  Sparkles,
  FileText,
  ExternalLink,
  Lightbulb,
  Luggage,
  Download,
  Loader2,
  Pencil,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TripMap } from "@/components/TripMap";
import { downloadItineraryPdf } from "@/lib/itinerary-pdf";
import { toast } from "sonner";
import {
  extractImageNames,
  extractLinks,
  updateDaysInRawContent,
  type Itinerary,
  type ItineraryActivity,
  type ItineraryDay,
} from "@/lib/itinerary";

// Botão de download do roteiro em PDF — usa o MESMO objeto `itinerary` já
// parseado que alimenta a tela (ver src/lib/itinerary-pdf.ts). Fica isolado
// num componente próprio só pra controlar o estado de "gerando..." sem
// misturar com o resto da view.
function DownloadPdfButton({ itinerary, destination }: { itinerary: Itinerary; destination: string }) {
  const [generating, setGenerating] = useState(false);

  async function handleDownload() {
    setGenerating(true);
    try {
      await downloadItineraryPdf(itinerary, destination);
    } catch {
      toast.error("Não consegui gerar o PDF agora. Tente de novo em instantes.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleDownload} disabled={generating}>
      {generating ? (
        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
      ) : (
        <Download className="mr-1.5 size-3.5" />
      )}
      {generating ? "Gerando PDF..." : "Baixar PDF"}
    </Button>
  );
}

const ICONS: Record<ItineraryActivity["kind"], typeof Plane> = {
  voo: Plane,
  refeicao: UtensilsCrossed,
  passeio: Camera,
  transporte: Car,
  hospedagem: BedDouble,
  outro: Sparkles,
};

function ChecklistBlock({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem itens.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={item + index} className="flex items-start gap-3">
          <Checkbox
            id={`check-${index}`}
            checked={Boolean(checked[index])}
            onCheckedChange={(value) =>
              setChecked((prev) => ({ ...prev, [index]: value === true }))
            }
            className="mt-0.5"
          />
          <label
            htmlFor={`check-${index}`}
            className={
              checked[index]
                ? "text-sm text-muted-foreground line-through"
                : "text-sm text-foreground"
            }
          >
            {item}
          </label>
        </li>
      ))}
    </ul>
  );
}

// Gera um link de busca do GetYourGuide já com o nome específico do
// passeio (ex.: "Beach Park, Aquiraz"), reaproveitando o mesmo dado que já
// alimenta o marcador do mapa ({{LOCAL: ...}}). Isso evita ter que confiar
// na IA pra gerar um link por atividade (risco de link inventado/quebrado):
// o link é montado aqui no código, com um parâmetro de busca por texto que
// já foi validado manualmente no GetYourGuide.
// Remove marcadores {{LOCAL: ...}} que sobraram no texto (ex.: quando nenhuma
// foto foi resolvida pro lugar). Só afeta a exibição: a extração de fotos e
// do mapa continua usando o conteúdo bruto.
function stripLocalMarkers(text: string): string {
  return text
    .replace(/\s*\{\{\s*LOCAL\s*:[^}]*\}\}/gi, "")
    .replace(/[ \t]+$/gm, "");
}

// Só faz sentido oferecer "Reservar" (busca no GetYourGuide) pra passeios e
// atrações. Hospedagem, restaurantes, praias, aeroportos etc. não são
// reserváveis por lá.
const NON_BOOKABLE_PLACE =
  /^(pousada|hotel|resort|hostel|flat|apart|casa|villa|vila|restaurante|bar|caf[eé]|bistr[oô]|aeroporto|rodovi[aá]ria|estac|praia|centro|bairro)\b/i;

function isBookableActivity(place: string, lodgingText: string): boolean {
  const label = (place.split(",")[0] ?? place).trim();
  if (!label || NON_BOOKABLE_PLACE.test(label)) return false;
  // Nome que aparece na seção de hospedagem sugerida = hotel/pousada.
  if (lodgingText.toLowerCase().includes(label.toLowerCase())) return false;
  return true;
}

function activityBookingUrl(place: string): string {
  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(place)}`;
}

function LinkCards({ body, empty }: { body: string; empty: string }) {
  const links = extractLinks(body);
  if (links.length === 0) {
    return body ? (
      <Markdown content={body} />
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <div key={link.url} className="card-luna flex items-center justify-between gap-3 p-4">
          <span className="text-sm font-medium">{link.label}</span>
          <Button asChild size="sm" variant="secondary">
            <a href={link.url} target="_blank" rel="noreferrer">
              Ver opções <ExternalLink className="ml-1 size-3.5" />
            </a>
          </Button>
        </div>
      ))}
    </div>
  );
}

// Seção "Roteiro dia a dia" com edição direta opcional (remover/reordenar
// atividades sem passar pela IA). `onEditDays` só vem preenchido na aba
// "Viagem" autenticada (ver src/routes/minhas-viagens/$tripId.tsx) — no
// link público de compartilhamento (roteiro/$token.tsx) a prop não é
// passada, então os controles de edição nem aparecem.
//
// Estado local otimista: a mudança aparece na hora, e só é revertida se o
// salvamento no servidor falhar. Ressincronizamos com `itinerary.dias`
// sempre que o texto bruto do roteiro muda de verdade (ex.: a Luna gerou
// uma nova versão pelo chat) — o `itinerary.raw` como dependência garante
// isso sem apagar uma edição em andamento por engano.
function DayByDaySection({
  itinerary,
  onEditDays,
}: {
  itinerary: Itinerary;
  onEditDays?: ((rawContent: string) => Promise<void>) | undefined;
}) {
  const [editMode, setEditMode] = useState(false);
  const [days, setDays] = useState<ItineraryDay[]>(itinerary.dias);
  const lodgingText = stripLocalMarkers(itinerary.hospedagem);

  useEffect(() => {
    setDays(itinerary.dias);
  }, [itinerary.raw]);

  async function persist(nextDays: ItineraryDay[]) {
    const previous = days;
    setDays(nextDays);
    if (!onEditDays) return;
    try {
      await onEditDays(updateDaysInRawContent(itinerary.raw, nextDays));
    } catch {
      setDays(previous);
      toast.error("Não consegui salvar essa alteração. Tente de novo.");
    }
  }

  function removeActivity(dayIndex: number, activityIndex: number) {
    void persist(
      days.map((day, di) =>
        di === dayIndex
          ? { ...day, activities: day.activities.filter((_, ai) => ai !== activityIndex) }
          : day,
      ),
    );
  }

  function moveActivity(dayIndex: number, activityIndex: number, direction: -1 | 1) {
    const day = days[dayIndex];
    if (!day) return;
    const target = activityIndex + direction;
    if (target < 0 || target >= day.activities.length) return;
    const activities = [...day.activities];
    const [moved] = activities.splice(activityIndex, 1);
    activities.splice(target, 0, moved!);
    void persist(days.map((d, di) => (di === dayIndex ? { ...d, activities } : d)));
  }

  if (days.length === 0) return null;

  return (
    <section className="card-luna p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl font-semibold">Roteiro dia a dia</h3>
        {onEditDays && (
          <Button
            variant={editMode ? "default" : "secondary"}
            size="sm"
            onClick={() => setEditMode((v) => !v)}
          >
            <Pencil className="mr-1.5 size-3.5" />
            {editMode ? "Concluir edição" : "Editar roteiro"}
          </Button>
        )}
      </div>
      {editMode && (
        <p className="mt-2 text-xs text-muted-foreground">
          Reordene ou remova atividades — a mudança já é salva na hora, sem precisar pedir pra
          Luna.
        </p>
      )}
      <ol className="mt-5 space-y-6 border-l border-border pl-6">
        {days.map((day, dayIndex) => (
          <li key={day.title} className="relative">
            <span className="absolute -left-[31px] top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-3" />
            </span>
            <h4 className="font-display text-lg font-semibold">{day.title}</h4>
            <ul className="mt-3 space-y-2">
              {day.activities.map((activity, index) => {
                const Icon = ICONS[activity.kind];
                const place: string | undefined = activity.places[0];
                const placeLabel = place ? (place.split(",")[0] ?? place).trim() : "";
                return (
                  <li
                    key={activity.text + index}
                    className="flex items-start gap-3 rounded-xl bg-muted/60 p-3"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="flex-1">
                      <span className="text-sm">{activity.text}</span>
                      {activity.kind === "passeio" &&
                        place &&
                        !editMode &&
                        isBookableActivity(place, lodgingText) && (
                        <a
                          href={activityBookingUrl(place)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          Reservar {placeLabel}
                        </a>
                      )}
                    </div>
                    {editMode && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label="Mover atividade pra cima"
                          disabled={index === 0}
                          onClick={() => moveActivity(dayIndex, index, -1)}
                          className="rounded-md p-1 text-muted-foreground transition hover:bg-background disabled:opacity-30"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Mover atividade pra baixo"
                          disabled={index === day.activities.length - 1}
                          onClick={() => moveActivity(dayIndex, index, 1)}
                          className="rounded-md p-1 text-muted-foreground transition hover:bg-background disabled:opacity-30"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Remover atividade"
                          onClick={() => removeActivity(dayIndex, index)}
                          className="rounded-md p-1 text-destructive transition hover:bg-destructive/10"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ItineraryView({
  itinerary,
  destination,
  onEditDays,
}: {
  itinerary: Itinerary;
  destination?: string;
  onEditDays?: ((rawContent: string) => Promise<void>) | undefined;
}) {
  const overviewNames = useMemo(
    () => [...extractImageNames(itinerary.hospedagem), ...extractImageNames(itinerary.restaurantes)],
    [itinerary],
  );
  const dayMapEntries = useMemo(
    () =>
      itinerary.dias.map((day, index) => {
        const match = /^Dia\s*\d+/i.exec(day.title);
        return {
          label: match ? match[0] : `Dia ${index + 1}`,
          placeNames: day.activities.flatMap((a) => a.places),
        };
      }),
    [itinerary],
  );
  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/40 to-accent/30 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Luna</p>
            <h2 className="mt-1 font-display text-3xl font-semibold">Seu roteiro completo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tudo organizado: documentos, dia a dia, restaurantes, reservas e checklist.
            </p>
          </div>
          {destination && <DownloadPdfButton itinerary={itinerary} destination={destination} />}
        </div>
      </header>

      {destination && (
        <TripMap destination={destination} overviewNames={overviewNames} days={dayMapEntries} />
      )}



      <Accordion type="multiple" defaultValue={["docs"]} className="card-luna px-5">
        <AccordionItem value="docs" className="border-none">
          <AccordionTrigger className="font-display text-lg">
            <span className="flex items-center gap-2">
              <FileText className="size-4 text-primary" /> Documentação e requisitos
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {itinerary.documentacao ? (
              <Markdown content={itinerary.documentacao} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem informações de documentação.</p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {itinerary.hospedagem && (
        <section className="card-luna p-6">
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
            <BedDouble className="size-4 text-primary" /> Hospedagem sugerida
          </h3>
          <div className="mt-4">
            <Markdown content={stripLocalMarkers(itinerary.hospedagem)} />
          </div>
        </section>
      )}

      <DayByDaySection itinerary={itinerary} onEditDays={onEditDays} />

      {itinerary.restaurantes && (
        <section className="card-luna p-6">
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
            <UtensilsCrossed className="size-4 text-primary" /> Restaurantes
          </h3>
          <div className="mt-4">
            <Markdown content={stripLocalMarkers(itinerary.restaurantes)} />
          </div>
        </section>
      )}

      {itinerary.recomendacoes && (
        <section className="card-luna p-6">
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Luggage className="size-4 text-primary" /> Recomendações
          </h3>
          <div className="mt-4">
            <Markdown content={itinerary.recomendacoes} />
          </div>
        </section>
      )}

      <section className="card-luna p-6">
        <Tabs defaultValue="transporte">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60">
            <TabsTrigger value="transporte">Transporte</TabsTrigger>
            <TabsTrigger value="hospedagem">Hospedagem</TabsTrigger>
            <TabsTrigger value="passeios">Passeios</TabsTrigger>
            <TabsTrigger value="seguro">Seguro</TabsTrigger>
            <TabsTrigger value="chip-transfer">Chip e Transfer</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="essencial">Essencial</TabsTrigger>
          </TabsList>
          <TabsContent value="transporte" className="pt-5">
            <LinkCards body={itinerary.linksTransporte} empty="Sem links de transporte." />
          </TabsContent>
          <TabsContent value="hospedagem" className="pt-5">
            <LinkCards body={itinerary.linksHospedagem} empty="Sem links de hospedagem." />
          </TabsContent>
          <TabsContent value="passeios" className="pt-5">
            <LinkCards body={itinerary.linksPasseios} empty="Sem links de passeios." />
          </TabsContent>
          <TabsContent value="seguro" className="pt-5">
            <LinkCards body={itinerary.linksSeguro} empty="Sem links de seguro viagem." />
          </TabsContent>
          <TabsContent value="chip-transfer" className="pt-5 space-y-5">
            <LinkCards body={itinerary.linksChip} empty="Sem links de chip/internet." />
            <LinkCards body={itinerary.linksTransfer} empty="Sem links de transfer." />
          </TabsContent>
          <TabsContent value="documentos" className="pt-5">
            {itinerary.documentacao ? (
              <Markdown content={itinerary.documentacao} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem documentos listados.</p>
            )}
          </TabsContent>
          <TabsContent value="checklist" className="pt-5">
            <ChecklistBlock items={itinerary.checklist} />
          </TabsContent>
          <TabsContent value="essencial" className="pt-5">
            {itinerary.essencial ? (
              <Markdown content={itinerary.essencial} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem informações essenciais.</p>
            )}
          </TabsContent>
        </Tabs>
      </section>

      {itinerary.dicas && (
        <section className="rounded-2xl border border-accent/60 bg-accent/25 p-6">
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Lightbulb className="size-4 text-accent-foreground" /> Dicas finais da Luna
          </h3>
          <div className="mt-3">
            <Markdown content={itinerary.dicas} />
          </div>
        </section>
      )}
    </div>
  );
}
