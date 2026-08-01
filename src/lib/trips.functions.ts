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
      .select("id, destination, origin, title, status, profile, created_at")
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
  .inputValidator((input: { tripId: string; status: "planejando" | "finalizada" }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trips")
      .update({ status: data.status })
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
