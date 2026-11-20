import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Quem comecou com "Apenas Passeios" pode, depois de receber o roteiro, pedir
// hospedagem e/ou voos. Aqui so trocamos o tipo de servico da viagem pra
// "Viagem Completa": a partir dai o prompt da Luna volta a incluir hospedagem
// e voos, e o filtro de "so passeios" deixa de cortar essas secoes.
export const upgradeTripToComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tripId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: trip, error } = await context.supabase
      .from("trips")
      .select("profile")
      .eq("id", data.tripId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!trip) throw new Error("Viagem não encontrada");
    const profile = (trip.profile ?? {}) as Record<string, unknown>;
    const next = { ...profile, service_type: "Viagem Completa" };
    const { error: updateError } = await context.supabase
      .from("trips")
      .update({ profile: next as never })
      .eq("id", data.tripId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });
