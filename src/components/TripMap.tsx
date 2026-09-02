import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Map } from "lucide-react";
import { getPlaceCoordinates } from "@/lib/trips.functions";
import { Button } from "@/components/ui/button";

const EMBED_KEY = import.meta.env["VITE_GOOGLE_MAPS_EMBED_KEY"] as string | undefined;

export type TripMapDay = { label: string; placeNames: string[] };

// Mapa real do roteiro usando a Maps Embed API do Google (gratuita e sem
// limite de uso). Um seletor (Geral / Dia 1 / Dia 2 / ...) troca quais
// lugares aparecem NO MESMO mapa — "Geral" usa hotéis/restaurantes com foto
// resolvida, cada dia usa os passeios daquele dia. Com 2+ lugares resolvidos
// desenha uma rota ligando eles; com 1, centraliza nele; sem nenhum, cai num
// mapa simples centrado no destino da viagem. Sem a chave configurada, não
// renderiza nada.
export function TripMap({
  destination,
  overviewNames,
  days,
}: {
  destination: string;
  overviewNames: string[];
  days: TripMapDay[];
}) {
  const [selected, setSelected] = useState<number>(-1);

  const activeNames = useMemo(() => {
    const names = selected === -1 ? overviewNames : (days[selected]?.placeNames ?? []);
    return Array.from(new Set(names));
  }, [selected, overviewNames, days]);

  const fetchCoords = useServerFn(getPlaceCoordinates);
  const { data } = useQuery({
    queryKey: ["place-coordinates", activeNames],
    queryFn: () => fetchCoords({ data: { names: activeNames } }),
    enabled: Boolean(EMBED_KEY) && activeNames.length > 0,
  });

  if (!EMBED_KEY) return null;

  const points = data ?? [];
  let src: string;
  if (points.length >= 2) {
    const sorted = points.slice(0, 10);
    const origin = `${sorted[0]!.lat},${sorted[0]!.lng}`;
    const destinationPoint = `${sorted[sorted.length - 1]!.lat},${sorted[sorted.length - 1]!.lng}`;
    const waypoints = sorted
      .slice(1, -1)
      .map((p) => `${p.lat},${p.lng}`)
      .join("|");
    const params = new URLSearchParams({ key: EMBED_KEY, origin, destination: destinationPoint });
    if (waypoints) params.set("waypoints", waypoints);
    src = `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
  } else if (points.length === 1) {
    const params = new URLSearchParams({
      key: EMBED_KEY,
      q: `${points[0]!.lat},${points[0]!.lng}`,
      zoom: "13",
    });
    src = `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
  } else {
    const params = new URLSearchParams({ key: EMBED_KEY, q: destination });
    src = `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
  }

  return (
    <section className="card-luna overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
        <div className="flex items-center gap-2">
          <Map className="size-4 text-primary" />
          <h3 className="font-display text-xl font-semibold">Mapa da viagem</h3>
        </div>
        {days.length > 0 && (
          <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto">
            <Button
              type="button"
              size="sm"
              variant={selected === -1 ? "default" : "outline"}
              className="shrink-0 rounded-full"
              onClick={() => setSelected(-1)}
            >
              Geral
            </Button>
            {days.map((day, index) => (
              <Button
                key={day.label + index}
                type="button"
                size="sm"
                variant={selected === index ? "default" : "outline"}
                className="shrink-0 rounded-full"
                onClick={() => setSelected(index)}
              >
                {day.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <iframe
        title="Mapa da viagem"
        className="h-80 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={src}
      />
    </section>
  );
}
