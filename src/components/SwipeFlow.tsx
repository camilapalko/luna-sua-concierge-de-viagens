import { useState } from "react";
import { SwipeDiscover } from "@/components/SwipeDiscover";

// Roda um baralho de atracoes por cidade, em sequencia, e junta tudo o que a
// pessoa curtiu. "Pular" encerra a etapa inteira (devolvendo o que ja foi
// escolhido, se houver).
export function SwipeFlow({
  cities,
  interests,
  days,
  onDone,
  onCancel,
}: {
  cities: string[];
  interests?: string[];
  days?: string;
  onDone: (liked: string[]) => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState<string[]>([]);
  const city = cities[index] ?? cities[0] ?? "";
  const isLast = index >= cities.length - 1;
  return (
    <SwipeDiscover
      key={city}
      destination={city}
      {...(interests ? { interests } : {})}
      {...(days ? { days } : {})}
      {...(cities.length > 1 ? { step: `Cidade ${index + 1} de ${cities.length}` } : {})}
      {...(isLast ? {} : { nextLabel: "Próxima cidade" })}
      onCancel={() => (all.length ? onDone(all) : onCancel())}
      onDone={(liked) => {
        const next = [...all, ...liked];
        if (isLast) onDone(next);
        else {
          setAll(next);
          setIndex(index + 1);
        }
      }}
    />
  );
}
