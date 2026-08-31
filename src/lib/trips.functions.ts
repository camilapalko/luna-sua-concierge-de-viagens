import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TripRow = {
  id: string;
  destination: string;
  origin: string | null;
  title: string | null;
  status: "planejando" | "finalizada";
  profile: Record<string, string | string[]>;
  created_at: string;
  share_token: string | null;
  share_enabled: boolean;
  itinerary_content: string | null;
};

export type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export const listTrips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trips")
      .select("id, destination, origin, title, status, profile, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as TripRow[];
  });

export const getTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tripId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase
      .from("trips")
      .select(
        "id, destination, origin, title, status, profile, created_at, share_token, share_enabled, itinerary_content",
      )
      .eq("id", data.tripId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!trip) throw new Error("Viagem não encontrada");

    const { data: messages, error: msgError } = await context.supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("trip_id", data.tripId)
      .order("created_at", { ascending: true });
    if (msgError) throw new Error(msgError.message);

    return {
      trip: trip as unknown as TripRow,
      messages: (messages ?? []) as unknown as MessageRow[],
    };
  });

export const createTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      destination: string;
      origin?: string | null;
      profile: Record<string, string | string[]>;
      firstMessage: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase
      .from("trips")
      .insert({
        user_id: context.userId,
        destination: data.destination || "Destino a definir",
        origin: data.origin ?? null,
        title: data.destination || "Nova viagem",
        profile: data.profile as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: msgError } = await context.supabase.from("messages").insert({
      trip_id: trip.id,
      role: "user",
      content: data.firstMessage,
    });
    if (msgError) throw new Error(msgError.message);

    return { tripId: trip.id as string };
  });

export const updateTripStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { tripId: string; status: "planejando" | "finalizada"; itineraryContent?: string }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    // Sempre que a viagem vira "finalizada" (ou é reconfirmada assim depois
    // de uma edição), guardamos o texto bruto do roteiro em itinerary_content.
    // É esse campo — e só ele — que alimenta a página pública de
    // compartilhamento, mantendo a conversa inteira fora do link público.
    const update: { status: "planejando" | "finalizada"; itinerary_content?: string } = {
      status: data.status,
    };
    if (data.itineraryContent) update.itinerary_content = data.itineraryContent;

    const { error } = await context.supabase
      .from("trips")
      .update(update)
      .eq("id", data.tripId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tripId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("trips").delete().eq("id", data.tripId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPlaceCoordinates = createServerFn({ method: "POST" })
  .inputValidator((input: { names: string[] }) => input)
  .handler(async ({ data }): Promise<Array<{ name: string; lat: number; lng: number }>> => {
    if (!data.names.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalized = data.names.map((n) => n.trim().replace(/\s+/g, " ").toLowerCase());
    const { data: rows, error } = await supabaseAdmin
      .from("place_photos")
      .select("query, lat, lng")
      .in("query", normalized);
    if (error || !rows) return [];
    return rows
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({ name: r.query, lat: r.lat as number, lng: r.lng as number }));
  });
