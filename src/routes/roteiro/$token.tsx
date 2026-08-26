import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MapPinOff } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { ItineraryView } from "@/components/ItineraryView";
import { parseItinerary } from "@/lib/itinerary";
import { getSharedTrip } from "@/lib/sharing.functions";

export const Route = createFileRoute("/roteiro/$token")({
  head: () => ({
    meta: [
      { title: "Roteiro de viagem — Luna" },
      {
        name: "description",
        content: "Confira o roteiro de viagem completo, organizado pela Luna.",
      },
    ],
  }),
  component: SharedItineraryPage,
});

function SharedItineraryPage() {
  const { token } = Route.useParams();
  const fetchShared = useServerFn(getSharedTrip);

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-trip", token],
    queryFn: () => fetchShared({ data: { token } }),
    retry: false,
  });

  return (
    <div className="flex min-h-screen flex-col bg-luna">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {isLoading && (
          <div className="flex justify-center py-24">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

        {error && !isLoading && (
          <div className="card-luna mx-auto mt-16 max-w-md p-10 text-center">
            <MapPinOff className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 font-display text-xl font-semibold">Roteiro não encontrado</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Esse link pode ter expirado ou o compartilhamento foi desativado.
            </p>
            <Button asChild className="mt-6 rounded-xl">
              <Link to="/">Conhecer a Luna</Link>
            </Button>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Roteiro compartilhado
              </p>
              <h1 className="font-display text-3xl font-semibold">
                {data.title || data.destination}
              </h1>
            </div>
            <ItineraryView itinerary={parseItinerary(data.itineraryContent)} />
          </div>
        )}
      </main>
    </div>
  );
}
