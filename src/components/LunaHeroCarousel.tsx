import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import lunaPraia from "@/assets/luna/luna-praia.webp";
import lunaNeve from "@/assets/luna/luna-neve.webp";
import lunaMochileira from "@/assets/luna/luna-mochileira.webp";
import lunaLuxo from "@/assets/luna/luna-luxo.webp";
import lunaPet from "@/assets/luna/luna-pet.webp";
import lunaAeromoca from "@/assets/luna/luna-aeromoca.webp";
import lunaResort from "@/assets/luna/luna-resort.webp";

const SLIDES = [
  {
    src: lunaAeromoca,
    alt: "Luna como aeromoça, pronta para embarcar",
    text: "Vou te ajudar a planejar a viagem perfeita. Conte-me sobre seus sonhos de viagem e eu cuidarei de cada detalhe.",
  },
  {
    src: lunaPraia,
    alt: "Luna relaxando em uma praia tropical",
    text: "Praia, sol e um drinque na mão? Eu monto o roteiro perfeito pro seu litoral dos sonhos.",
  },
  {
    src: lunaMochileira,
    alt: "Luna mochileira explorando a natureza com um mapa",
    text: "De trilha em trilha, eu organizo cada etapa da sua aventura — sem perder nenhum detalhe.",
  },
  {
    src: lunaLuxo,
    alt: "Luna em um look de viagem de luxo",
    text: "Curtir uma viagem de luxo? Eu seleciono hospedagem, passeios e experiências à altura.",
  },
  {
    src: lunaPet,
    alt: "Luna em uma viagem com seu pet",
    text: "Viajando com seu pet? Eu já penso em tudo pra vocês dois aproveitarem juntos.",
  },
  {
    src: lunaNeve,
    alt: "Luna curtindo a neve em uma estação de esqui",
    text: "Bora pra neve? Eu cuido do roteiro pra você só se preocupar em curtir a estação.",
  },
  {
    src: lunaResort,
    alt: "Luna relaxando à beira da piscina em um resort",
    text: "Descanso total em um resort? Eu organizo tudo pra você não pensar em mais nada.",
  },
];

const INTERVAL_MS = 4500;

export function LunaHeroCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const current = (SLIDES[index] ?? SLIDES[0])!;

  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl shadow-[var(--shadow-soft)] md:max-w-none">
      {SLIDES.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          width={760}
          height={1013}
          loading={i === 0 ? "eager" : "lazy"}
          fetchPriority={i === 0 ? "high" : "low"}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* Badge flutuante */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-primary shadow-md backdrop-blur">
        <Plane className="size-3.5" />
        Viagem Personalizada
      </div>

      {/* Overlay com fala da Luna */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-6 pb-5 pt-16">
        <p className="font-display text-xl font-semibold text-white">Olá! Sou a Luna.</p>
        <p
          key={current.text}
          className="mt-1.5 max-w-sm text-sm text-white/85 transition-opacity duration-700"
        >
          {current.text}
        </p>

        {/* Indicadores */}
        <div className="mt-4 flex gap-1.5">
          {SLIDES.map((slide, i) => (
            <span
              key={slide.src}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
