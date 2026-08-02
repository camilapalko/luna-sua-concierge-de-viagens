import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, MapPin, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteTrip, listTrips, type TripRow } from "@/lib/trips.functions";
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
  const queryClient = useQueryClient();
  const fetchTrips = useServerFn(listTrips);
  const removeTrip = useServerFn(deleteTrip);
  const [tripToDelete, setTripToDelete] = useState<TripRow | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: (tripId: string) => removeTrip({ data: { tripId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Viagem apagada.");
      setTripToDelete(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Não consegui apagar essa viagem.");
    },
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
            <div
              key={trip.id}
              className="card-luna relative p-6 transition hover:shadow-[var(--shadow-soft)]"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 size-8 text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setTripToDelete(trip);
                }}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Apagar viagem</span>
              </Button>

              <Link
                to="/minhas-viagens/$tripId"
                params={{ tripId: trip.id }}
                className="block pr-8"
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
            </div>
          ))}
        </div>
      </main>

      <AlertDialog
        open={tripToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTripToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta viagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {tripToDelete
                ? `Isso vai apagar "${tripToDelete.destination}" e toda a conversa com a Luna. Essa ação não pode ser desfeita.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (tripToDelete) deleteMutation.mutate(tripToDelete.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 size-4" />
              )}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
