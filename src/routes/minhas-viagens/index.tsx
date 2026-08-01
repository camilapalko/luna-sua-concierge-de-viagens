import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, MapPin, Loader2, Plus } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listTrips } from "@/lib/trips.functions";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/minhas-viagens/")({
  head: () => ({
    meta: [
      { title: "Minhas viagens — Luna" },
      {
        name: "description",
        content: "Acompanhe suas viagens planejadas com a Luna e continue de onde parou.",
      },
      { property: "og:title", content: "Minhas viagens — Luna" },
      {
        property: "og:description",
        content: "Suas viagens planejadas com a Luna, sempre salvas e prontas para continuar.",
      },
    ],
  }),
  component: TripsPage,
});

function TripsPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const fetchTrips = useServerFn(listTrips);

  useEffect(() => {
    if (!loading && !session) {
      void navigate({
        to: "/auth",
        search: { redirect: "/minhas-viagens" },
        replace: true,
      });
    }
  }, [loading, session, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["trips", session?.user.id],
    queryFn: () => fetchTrips(),
    enabled: Boolean(session),
  });

  return (
    <div className="min-h-screen bg-luna">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold">Minhas viagens</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Continue o planejamento de onde parou.
            </p>
          </div>
          <Button asChild className="rounded-2xl">
            <Link to="/chat">
              <Plus className="mr-1 size-4" /> Nova viagem
            </Link>
          </Button>
        </div>

        {(loading || isLoading) && (
          <div className="mt-16 flex justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && data && data.length === 0 && (
          <div className="card-luna mt-10 p-10 text-center">
            <p className="font-display text-2xl">Nenhuma viagem ainda</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Que tal contar para a Luna aonde você quer ir?
            </p>
            <Button asChild className="mt-6 rounded-2xl">
              <Link to="/chat">Começar meu planejamento</Link>
            </Button>
          </div>
        )}

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((trip) => (
            <Link
              key={trip.id}
              to="/minhas-viagens/$tripId"
              params={{ tripId: trip.id }}
              className="card-luna block p-6 transition hover:shadow-[var(--shadow-soft)]"
            >
              <Badge variant={trip.status === "finalizada" ? "default" : "secondary"}>
                {trip.status === "finalizada" ? "Finalizada" : "Planejando"}
              </Badge>
              <h2 className="mt-4 flex items-center gap-2 font-display text-2xl font-semibold">
                <MapPin className="size-4 text-primary" /> {trip.destination}
              </h2>
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" />
                Criada em {new Date(trip.created_at).toLocaleDateString("pt-BR")}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
