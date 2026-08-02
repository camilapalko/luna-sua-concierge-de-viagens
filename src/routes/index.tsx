import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, MessagesSquare, Compass, CheckCircle2, ArrowRight, Star } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { LunaHeroCarousel } from "@/components/LunaHeroCarousel";
import { PlanningPreviewSection } from "@/components/PlanningPreviewSection";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Luna — viagens inteligentes, memórias inesquecíveis" },
      {
        name: "description",
        content:
          "A Luna é sua concierge digital de viagens: conta seus desejos, recebe um roteiro personalizado com voos, hospedagem, passeios e restaurantes.",
      },
      { property: "og:title", content: "Luna — viagens inteligentes, memórias inesquecíveis" },
      {
        property: "og:description",
        content:
          "A Luna é sua concierge digital de viagens: conta seus desejos, recebe um roteiro personalizado com voos, hospedagem, passeios e restaurantes.",
      },
    ],
  }),
  component: Home,
});

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Conte seus desejos",
    text: "Responda algumas perguntas rápidas sobre destino, datas, estilo e interesses.",
  },
  {
    icon: Compass,
    title: "Receba sugestões personalizadas",
    text: "A Luna monta tudo em etapas: voos, hospedagem, passeios e restaurantes sob medida.",
  },
  {
    icon: CheckCircle2,
    title: "Valide e aproveite",
    text: "Você aprova cada etapa e recebe o roteiro completo com checklist e links de reserva.",
  },
];

const FAQ = [
  {
    q: "Como funciona a Luna?",
    a: "Você conversa com a Luna em um bate-papo. Ela faz algumas perguntas sobre a sua viagem e, a partir do seu perfil, monta o planejamento em etapas — sempre esperando sua validação antes de avançar.",
  },
  {
    q: "Quanto custa?",
    a: "O planejamento com a Luna é gratuito enquanto estamos em fase inicial. Você só paga pelas reservas que fizer diretamente com companhias aéreas, hotéis e operadores.",
  },
  {
    q: "A Luna faz a reserva por mim?",
    a: "Não. A Luna pesquisa, compara e organiza tudo. No roteiro final você recebe os links para concluir cada reserva com segurança nos sites oficiais.",
  },
  {
    q: "Ela ajuda com viagens internacionais?",
    a: "Sim. A Luna cobre destinos no Brasil e no mundo, incluindo documentação necessária, vistos, vacinas e dicas específicas de cada país.",
  },
  {
    q: "Quanto tempo leva para ter o roteiro?",
    a: "Depende do tamanho da viagem. Roteiros simples ficam prontos em minutos; viagens longas com vários destinos são construídas por partes, no seu ritmo.",
  },
  {
    q: "Posso mudar depois?",
    a: "Sempre. Sua viagem fica salva em 'Minhas viagens' e você pode retomar a conversa a qualquer momento para ajustar datas, passeios ou orçamento.",
  },
];

function Home() {
  return (
    <div className="min-h-screen bg-luna">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" /> Sua concierge de viagens
            </span>
            <h1 className="mt-5 font-display text-5xl leading-tight md:text-6xl">
              Viagens inteligentes,
              <br />
              <span className="font-semibold">memórias inesquecíveis.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-muted-foreground">
              A Luna é a amiga experiente que ama planejar viagens. Ela entende o seu estilo,
              pesquisa por você e organiza tudo em um roteiro lindo — do voo ao restaurante
              perfeito.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-2xl">
                <Link to="/chat">
                  Começar meu planejamento <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-2xl">
                <Link to="/minhas-viagens">Minhas viagens</Link>
              </Button>
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> Tudo feito sob medida para você
            </div>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex -space-x-3">
                {["#4A819A", "#E6E6FA", "#F4E3B2", "#94a3b8"].map((color) => (
                  <span
                    key={color}
                    className="size-8 rounded-full border-2 border-background"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Feito para viajantes exigentes</p>
                <div className="mt-0.5 flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-current" />
                  ))}
                  <span className="ml-1 text-muted-foreground">planejamento sob medida</span>
                </div>
              </div>
            </div>
          </div>
          <LunaHeroCarousel />
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center font-display text-4xl font-semibold">Como funciona</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <article key={step.title} className="card-luna p-7">
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <step.icon className="size-5" />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-primary">
                  Passo {index + 1}
                </p>
                <h3 className="mt-1 font-display text-2xl font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <PlanningPreviewSection />

        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-center font-display text-4xl font-semibold">Perguntas frequentes</h2>
          <Accordion type="single" collapsible className="mt-8 card-luna px-6">
            {FAQ.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left font-display text-lg">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-24">
          <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-secondary/50 to-accent/40 p-10 text-center">
            <h2 className="font-display text-3xl font-semibold">Pronta para a próxima viagem?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Leva menos de dois minutos para contar seus desejos — e você nem precisa criar conta
              para começar.
            </p>
            <Button asChild size="lg" className="mt-6 rounded-2xl">
              <Link to="/chat">Começar meu planejamento</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Luna ✨ · concierge digital de viagens
      </footer>
    </div>
  );
}
