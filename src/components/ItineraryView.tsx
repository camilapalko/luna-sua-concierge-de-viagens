import { useMemo, useState } from "react";
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
import {
  extractImageNames,
  extractLinks,
  type Itinerary,
  type ItineraryActivity,
} from "@/lib/itinerary";

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

export function ItineraryView({
  itinerary,
  destination,
}: {
  itinerary: Itinerary;
  destination?: string;
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
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Luna</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">Seu roteiro completo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo organizado: documentos, dia a dia, restaurantes, reservas e checklist.
        </p>
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
            <Markdown content={itinerary.hospedagem} />
          </div>
        </section>
      )}

      {itinerary.dias.length > 0 && (
        <section className="card-luna p-6">
          <h3 className="font-display text-xl font-semibold">Roteiro dia a dia</h3>
          <ol className="mt-5 space-y-6 border-l border-border pl-6">
            {itinerary.dias.map((day) => (
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
                          {activity.kind === "passeio" && place && (
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
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {itinerary.restaurantes && (
        <section className="card-luna p-6">
          <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
            <UtensilsCrossed className="size-4 text-primary" /> Restaurantes
          </h3>
          <div className="mt-4">
            <Markdown content={itinerary.restaurantes} />
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
