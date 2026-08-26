import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SharedTrip = {
  destination: string;
  origin: string | null;
  title: string | null;
  itineraryContent: string;
};

// Gera (ou reaproveita) um token de compartilhamento e liga o link público
// para o roteiro final dessa viagem. Só o dono da viagem consegue chamar
// isso, porque passa pelo middleware de auth + RLS (auth.uid() = user_id).
export const enableSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tripId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase
      .from("trips")
      .select("id, share_token, itinerary_content")
      .eq("id", data.tripId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!trip) throw new Error("Viagem não encontrada");
    if (!trip.itinerary_content) {
      throw new Error("Essa viagem ainda não tem um roteiro final para compartilhar.");
    }

    const token = trip.share_token ?? crypto.randomUUID();
    const { error: updateError } = await context.supabase
      .from("trips")
      .update({ share_token: token, share_enabled: true })
      .eq("id", data.tripId);
    if (updateError) throw new Error(updateError.message);

    return { token };
  });

export const disableSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tripId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trips")
      .update({ share_enabled: false })
      .eq("id", data.tripId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Rota pública (sem auth): devolve só o necessário para renderizar o roteiro
// — nunca a conversa (tabela messages) nem o resto da linha de trips. Usa o
// client com service role porque um visitante anônimo não tem uma sessão que
// passe pela RLS de "auth.uid() = user_id".
export const getSharedTrip = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }): Promise<SharedTrip> => {
    if (!data.token) throw new Error("Link inválido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: trip, error } = await supabaseAdmin
      .from("trips")
      .select("destination, origin, title, itinerary_content, share_enabled")
      .eq("share_token", data.token)
      .maybeSingle();

    if (error || !trip || !trip.share_enabled || !trip.itinerary_content) {
      throw new Error("Esse roteiro não está mais disponível.");
    }

    return {
      destination: trip.destination,
      origin: trip.origin,
      title: trip.title,
      itineraryContent: trip.itinerary_content,
    };
  });
