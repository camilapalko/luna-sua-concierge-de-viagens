import { useEffect, useState } from "react";
import lunaPraia from "@/assets/luna/luna-praia.jpg";
import lunaNeve from "@/assets/luna/luna-neve.jpg";
import lunaMochileira from "@/assets/luna/luna-mochileira.jpg";
import lunaLuxo from "@/assets/luna/luna-luxo.jpg";
import lunaPet from "@/assets/luna/luna-pet.jpg";
import lunaAeromoca from "@/assets/luna/luna-aeromoca.jpg";
import lunaResort from "@/assets/luna/luna-resort.jpg";

const SLIDES = [
  { src: lunaAeromoca, alt: "Luna como aeromoça, pronta para embarcar" },
  { src: lunaPraia, alt: "Luna relaxando em uma praia tropical" },
  { src: lunaMochileira, alt: "Luna mochileira explorando a natureza com um mapa" },
  { src: lunaLuxo, alt: "Luna em um look de viagem de luxo" },
  { src: lunaPet, alt: "Luna em uma viagem com seu pet" },
  { src: lunaNeve, alt: "Luna curtindo a neve em uma estação de esqui" },
  { src: lunaResort, alt: "Luna relaxando à beira da piscina em um resort" },
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

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl shadow-[var(--shadow-soft)]">
      {SLIDES.map((slide, i) => (
        <img
          key={slide.src}
          src={slide.src}
          alt={slide.alt}
          width={900}
          height={1200}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 p-4">
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
  );
}
