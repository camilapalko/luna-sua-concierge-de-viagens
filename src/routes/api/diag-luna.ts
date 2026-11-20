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
          const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": gkey ?? "",
              "X-Goog-FieldMask": "places.id,places.location,places.photos",
            },
            body: JSON.stringify({ textQuery: "Torre de Belém, Lisboa", maxResultCount: 1 }),
          });
          const t = await r.text();
          out["search"] = { status: r.status, body: scrub(t) };
          let photoName: string | undefined;
          try {
            photoName = (JSON.parse(t) as { places?: Array<{ photos?: Array<{ name?: string }> }> }).places?.[0]?.photos?.[0]?.name;
          } catch {
            /* ignore */
          }
          out["photoName"] = photoName ?? null;
          if (photoName) {
            const p = await fetch(`https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=640&key=${gkey}`);
            const ct = p.headers.get("content-type");
            const buf = new Uint8Array(await p.arrayBuffer());
            out["media"] = { status: p.status, contentType: ct, bytes: buf.length, err: p.ok ? null : scrub(new TextDecoder().decode(buf)) };
            if (p.ok) {
              const up = await supabaseAdmin.storage
                .from("place-photos")
                .upload("diag-test.jpg", buf, { contentType: ct ?? "image/jpeg", upsert: true });
              out["upload"] = up.error ? { error: up.error.message } : "ok";
              if (!up.error) {
                const s = await supabaseAdmin.storage.from("place-photos").createSignedUrl("diag-test.jpg", 60);
                out["signed"] = s.error ? { error: s.error.message } : "ok";
                await supabaseAdmin.storage.from("place-photos").remove(["diag-test.jpg"]);
              }
            }
          }
        } catch (e) {
          out["placesError"] = String(e);
        }
        const aiKey = process.env["GEMINI_API_KEY"];
        try {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
            body: JSON.stringify({
              model: "gemini-3.6-flash",
              messages: [{ role: "user", content: "A Torre de Belém em Lisboa está aberta hoje? Responda em 1 frase." }],
              stream: false,
              max_tokens: 1024,
              reasoning_effort: "low",
              tools: [{ google_search: {} }],
            }),
          });
          const t = await r.text();
          out["searchTool"] = { status: r.status, body: t.slice(0, 600) };
        } catch (e) {
          out["searchToolError"] = String(e);
        }
        return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
