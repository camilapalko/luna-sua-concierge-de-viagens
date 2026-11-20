import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// TEMPORARIO: diagnostico de Places API e Gemini google_search. Remover depois.
export const Route = createFileRoute("/api/diag-luna")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("k") !== "luna-diag-2611") return new Response("nf", { status: 404 });
        const out: Record<string, unknown> = {};
        const gkey = process.env["GOOGLE_MAPS_API_KEY"];
        const scrub = (s: string) => (gkey ? s.split(gkey).join("***") : s).slice(0, 700);
        out["hasGoogleKey"] = !!gkey;
        try {
          const variants: Array<[string, string]> = [
            ["places.id,places.displayName,places.photos", "Torre de Belém Lisboa"],
            ["places.id,places.photos.name,places.photos.widthPx", "Eiffel Tower Paris"],
            ["*", "Torre de Belem"],
          ];
          const res: unknown[] = [];
          for (const [mask, q] of variants) {
            const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Goog-Api-Key": gkey ?? "", "X-Goog-FieldMask": mask },
              body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
            });
            const t = await r.text();
            res.push({ mask, q, status: r.status, keys: (() => { try { const pl = (JSON.parse(t) as { places?: Array<Record<string, unknown>> }).places?.[0]; return pl ? Object.keys(pl) : null; } catch { return null; } })(), body: scrub(t).slice(0, 350) });
          }
          out["variants"] = res;
        } catch (e) {
          out["placesError"] = String(e);
        }
        void supabaseAdmin;
        const aiKey = process.env["GEMINI_API_KEY"];
        try {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": aiKey ?? "" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "A Torre de Belém em Lisboa está aberta hoje? Responda em 1 frase." }] }],
              tools: [{ google_search: {} }],
            }),
          });
          const t = await r.text();
          out["nativeSearch"] = { status: r.status, body: t.slice(0, 900) };
        } catch (e) {
          out["nativeSearchError"] = String(e);
        }
        return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
