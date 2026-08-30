import {
  Plane,
  Building2,
  MapPinned,
  CalendarDays,
  UtensilsCrossed,
  Camera,
  Utensils,
  Waves,
  Landmark,
} from "lucide-react";

const FLIGHT_CARD = [
  {
    icon: Plane,
    title: "LATAM",
    subtitle: "São Paulo → Rio · Direto - 1h15min",
    value: "R$ 890",
  },
  {
    icon: Building2,
    title: "Hotel Fasano",
    subtitle: "★ 4.8 · 3 diárias",
    value: "R$ 2.400",
  },
  {
    icon: MapPinned,
    title: "Transfer Executivo",
    subtitle: "Aeroporto → Hotel · Conforto e segurança",
    value: "R$ 180",
  },
];

const ITINERARY_CARD = [
  {
    icon: CalendarDays,
    time: "Dia 1 - 9:00",
    title: "Chegada e Check-in",
    subtitle: "Hotel Copacabana Palace",
  },
  {
    icon: UtensilsCrossed,
    time: "Dia 1 - 13:00",
    title: "Almoço frente ao mar",
    subtitle: "Restaurante Marius",
  },
  {
    icon: Camera,
    time: "Dia 1 - 16:00",
    title: "Passeio pelo Pão de Açúcar",
    subtitle: "Duração: 2–3 horas",
  },
];

const TIPS_CARD = [
  {
    icon: Utensils,
    title: "Aprazível",
    subtitle: "Culinária brasileira com vista panorâmica",
    meta: "$$$ · Santa Teresa",
  },
  {
    icon: Waves,
    title: "Praias do Leblon",
    subtitle: "Mais tranquila e charmosa que Copacabana",
    meta: "Gratuito · Zona Sul",
  },
  {
    icon: Landmark,
    title: "Escadaria Selarón",
    subtitle: "Obra de arte icônica do Rio",
    meta: "Gratuito · Lapa",
  },
];

const COLUMNS = [
  {
    icon: Plane,
    title: "Voos, Hotéis e Locomoção",
    text: "Transporte, voos e hospedagem",
  },
  {
    icon: CalendarDays,
    title: "Roteiro Dia a Dia",
    text: "Itinerário completo com horários e sugestões",
  },
  {
    icon: MapPinned,
    title: "Dicas e Recomendações",
    text: "Restaurantes, passeios e experiências locais",
  },
];

export function PlanningPreviewSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h2 className="text-center font-display text-4xl font-semibold">
        Veja o que você vai receber no seu planejamento
      </h2>

      {/* No celular isso vira um carrossel horizontal com snap (arraste pros
          lados) em vez de empilhar as 3 colunas na vertical — cada coluna
          já tem 3 itens dentro, então empilhado ficava um bloco muito
          comprido/estreito. A partir de md volta a ser a grade normal de
          3 colunas lado a lado. */}
      <div className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:grid md:snap-none md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0">
        <div className="flex h-full w-[85%] shrink-0 snap-center flex-col md:w-auto md:shrink md:snap-align-none">
          <ColumnHeading
            icon={COLUMNS[0]!.icon}
            title={COLUMNS[0]!.title}
            text={COLUMNS[0]!.text}
          />
          <div className="card-luna mt-4 flex-1 space-y-3 p-4">
            {FLIGHT_CARD.map((item) => (
              <div key={item.title} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                <item.icon className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-full w-[85%] shrink-0 snap-center flex-col md:w-auto md:shrink md:snap-align-none">
          <ColumnHeading
            icon={COLUMNS[1]!.icon}
            title={COLUMNS[1]!.title}
            text={COLUMNS[1]!.text}
          />
          <div className="card-luna mt-4 flex-1 space-y-3 p-4">
            {ITINERARY_CARD.map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-xl bg-muted/60 p-3">
                <item.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {item.time}
                  </p>
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-full w-[85%] shrink-0 snap-center flex-col md:w-auto md:shrink md:snap-align-none">
          <ColumnHeading
            icon={COLUMNS[2]!.icon}
            title={COLUMNS[2]!.title}
            text={COLUMNS[2]!.text}
          />
          <div className="card-luna mt-4 flex-1 space-y-3 p-4">
            {TIPS_CARD.map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-xl bg-muted/60 p-3">
                <item.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{item.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ColumnHeading({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Plane;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
