import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TripChat } from "@/components/TripChat";
import { ItineraryView } from "@/components/ItineraryView";
import { ShareTripPanel } from "@/components/ShareTripPanel";
import { TripProfileDialog } from "@/components/TripProfileDialog";
import { findLatestItinerary } from "@/lib/itinerary";
import { getTrip, updateTripStatus, saveItineraryEdit, type MessageRow } from "@/lib/trips.functions";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/minhas-viagens/$tripId")({
  head: () => ({
    meta: [
      { title: "Sua viagem — Luna" },
      {
        name: "description",
        content: "Continue a conversa com a Luna e veja o roteiro completo da sua viagem.",
      },
      { property: "og:title", content: "Sua viagem — Luna" },
      {
        property: "og:description",
        content: "Chat com a Luna e roteiro completo da sua viagem em um só lugar.",
      },
    ],
  }),
  component: TripPage,
});

function TripPage() {
  const { tripId } = Route.useParams();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const fetchTrip = useServerFn(getTrip);
  const markFinished = useServerFn(updateTripStatus);
  const saveEdit = useServerFn(saveItineraryEdit);
  const queryClient = useQueryClient();
  const [liveMessages, setLiveMessages] = useState<Array<Pick<MessageRow, "role" | "content">>>([]);
  const syncedStatus = useRef(false);

  useEffect(() => {
    if (!loading && !session) {
      void navigate({
        to: "/auth",
        search: { redirect: `/minhas-viagens/${tripId}` },
        replace: true,
      });
    }
  }, [loading, session, navigate, tripId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["trip", tripId, session?.user.id],
    queryFn: () => fetchTrip({ data: { tripId } }),
    enabled: Boolean(session),
  });

  // Junta o que veio do banco (data.messages) com o que o chat tem localmente
  // (liveMessages) em vez de escolher um OU outro: se o componente de chat
  // remontar (ex.: trocar de aba e voltar) e "esquecer" mensagens novas que
  // ainda não tinham sido recarregadas do banco, o roteiro final não some da
  // aba "Viagem" por causa disso.
  const itinerary = useMemo(() => {
    const base = data?.messages ?? [];
    const extra = liveMessages.filter(
      (lm) => !base.some((m) => m.role === lm.role && m.content === lm.content),
    );
    return findLatestItinerary([...base, ...extra]);
  }, [liveMessages, data]);

  // Autocorreção: normalmente o status vira "finalizada" no momento em que o
  // chat recebe a resposta com o roteiro (ver TripChat.tsx). Mas se por
  // qualquer motivo isso não disparar naquele momento (erro de rede, resposta
  // fora do formato esperado antes de uma correção de prompt, etc.), a
  // viagem ficava presa em "Planejando" para sempre, mesmo com o roteiro já
  // completo. Aqui, sempre que a aba Viagem detectar um roteiro válido e o
  // status do banco ainda não estiver "finalizada", corrigimos sozinhos.
  useEffect(() => {
    if (!itinerary || !data?.trip || data.trip.status === "finalizada" || syncedStatus.current) {
      return;
    }
    syncedStatus.current = true;
    markFinished({
      data: { tripId: data.trip.id, status: "finalizada", itineraryContent: itinerary.raw },
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["trip", tripId] }))
      .catch(() => {
        syncedStatus.current = false;
      });
  }, [itinerary, data, markFinished, queryClient, tripId]);

  if (loading || isLoading || !data) {
    return (
      <div className="min-h-screen bg-luna">
        <SiteHeader />
        <div className="flex justify-center py-24">
          {error ? (
            <p className="text-sm text-muted-foreground">
              Não consegui abrir essa viagem. Tente novamente.
            </p>
          ) : (
            <Loader2 className="size-6 animate-spin text-primary" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-luna">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
              <Link to="/minhas-viagens">
                <ArrowLeft className="mr-1 size-4" /> Minhas viagens
              </Link>
            </Button>
            <h1 className="font-display text-3xl font-semibold">{data.trip.destination}</h1>
          </div>
          <div className="flex items-center gap-2">
            <TripProfileDialog profile={data.trip.profile} />
            <Badge variant={data.trip.status === "finalizada" ? "default" : "secondary"}>
              {data.trip.status === "finalizada" ? "Finalizada" : "Planejando"}
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="chat" className="flex flex-1 flex-col">
          <TabsList className="w-full max-w-xs">
            <TabsTrigger value="chat" className="flex-1">
              Chat
            </TabsTrigger>
            <TabsTrigger value="viagem" className="flex-1">
              Viagem
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-6 flex-1">
            <div className="card-luna flex h-[calc(100vh-19rem)] min-h-[420px] flex-col overflow-hidden">
              <TripChat
                trip={data.trip}
                initialMessages={data.messages}
                onMessagesChange={setLiveMessages}
              />
            </div>
          </TabsContent>

          <TabsContent value="viagem" className="mt-6">
            {itinerary ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <ShareTripPanel
                    trip={data.trip}
                    onChange={() => queryClient.invalidateQueries({ queryKey: ["trip", tripId] })}
                  />
                </div>
                <ItineraryView
                  itinerary={itinerary}
                  destination={data.trip.destination}
                  onEditDays={async (content) => {
                    await saveEdit({ data: { tripId: data.trip.id, content } });
                    await queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
                  }}
                />
              </div>
            ) : (
              <div className="card-luna p-10 text-center">
                <p className="font-display text-2xl">Roteiro em construção</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Continue a conversa na aba Chat. Assim que a Luna enviar o roteiro completo, ele
                  aparece aqui, formatado e organizado.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
