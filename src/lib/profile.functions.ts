import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Answers, MilesProgram } from "@/lib/intake";

export type { MilesProgram };

export type TravelerProfile = {
  defaults: Answers;
  milesPrograms: MilesProgram[];
};

const EMPTY_PROFILE: TravelerProfile = { defaults: {}, milesPrograms: [] };

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TravelerProfile> => {
    const { data, error } = await context.supabase
      .from("traveler_profiles")
      .select("defaults, miles_programs")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return EMPTY_PROFILE;
    return {
      defaults: (data.defaults ?? {}) as Answers,
      milesPrograms: (data.miles_programs ?? []) as MilesProgram[],
    };
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TravelerProfile) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("traveler_profiles").upsert({
      user_id: context.userId,
      defaults: data.defaults as never,
      miles_programs: data.milesPrograms as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
