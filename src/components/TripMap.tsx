import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Map } from "lucide-react";
import { getPlaceCoordinates } from "@/lib/trips.functions";

const EMBED_KEY = import.meta.env["VITE_GOOGLE_MAPS_EMBED_KEY"] as string | undefined;

// Mapa real do roteiro usando a Maps Embed API do Google (gratuita e sem
// limite de uso). Se tivermos 2+ lugares com coordenadas resolvidas (via
// cache de fotos), desenha uma rota ligando eles; com 1, centraliza nele;
// sem nenhum, cai num mapa simples centrado no destino da viagem (sempre
// funciona, mesmo sem nenhuma foto resolvida ainda). Sem a chave configurada,
// não renderiza nada.
export function TripMap({
  destination,
  placeNames,
}: {
  destination: string;
  placeNames: string[];
}) {
  const fetchCoords = useServerFn(getPlaceCoordinates);
  const uniqueNames = useMemo(() => Array.from(new Set(placeNames)), [placeNames]);

  const { data } = useQuery({
    queryKey: ["place-coordinates", uniqueNames],
    queryFn: () => fetchCoords({ data: { names: uniqueNames } }),
    enabled: Boolean(EMBED_KEY) && uniqueNames.length > 0,
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
      <div className="flex items-center gap-2 p-6 pb-4">
        <Map className="size-4 text-primary" />
        <h3 className="font-display text-xl font-semibold">Mapa da viagem</h3>
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
