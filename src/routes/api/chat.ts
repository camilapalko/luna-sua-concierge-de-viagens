import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { LUNA_SYSTEM_PROMPT, buildContextPrompt } from "@/lib/luna-prompt";
import type { Database } from "@/integrations/supabase/types";

type Body = { tripId?: string; message?: string };

const MODEL = "google/gemini-3.6-flash";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return json({ error: "Faça login para conversar com a Luna." }, 401);

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const aiKey = process.env["LOVABLE_API_KEY"];
        if (!supabaseUrl || !supabaseKey) return json({ error: "Backend indisponível." }, 500);
        if (!aiKey) return json({ error: "Serviço de IA indisponível." }, 500);

        const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.delete("Authorization");
              headers.set("apikey", supabaseKey);
              headers.set("Authorization", `Bearer ${token}`);
              return fetch(input, { ...init, headers });
            },
          },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: claims } = await supabase.auth.getClaims(token);
        if (!claims?.claims?.sub) return json({ error: "Sessão inválida." }, 401);

        const body = (await request.json()) as Body;
        if (!body.tripId) return json({ error: "Viagem não informada." }, 400);

        const { data: trip, error: tripError } = await supabase
          .from("trips")
          .select("id, destination, origin, profile")
          .eq("id", body.tripId)
          .maybeSingle();
        if (tripError || !trip) return json({ error: "Viagem não encontrada." }, 404);

        if (body.message?.trim()) {
          const { error } = await supabase
            .from("messages")
            .insert({ trip_id: trip.id, role: "user", content: body.message.trim() });
          if (error) return json({ error: error.message }, 500);
        }

        const { data: history, error: historyError } = await supabase
          .from("messages")
          .select("role, content")
          .eq("trip_id", trip.id)
          .order("created_at", { ascending: true });
        if (historyError) return json({ error: historyError.message }, 500);

        const messages = [
          { role: "system", content: LUNA_SYSTEM_PROMPT },
          {
            role: "system",
            content: buildContextPrompt(
              (trip.profile ?? {}) as unknown as Record<string, unknown>,
            ),
          },
          ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
        ];

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": aiKey,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({ model: MODEL, messages, stream: true }),
        });

        if (aiRes.status === 429)
          return json({ error: "Muitas mensagens em pouco tempo. Aguarde um instante." }, 429);
        if (aiRes.status === 402)
          return json({ error: "Os créditos de IA acabaram. Adicione créditos para continuar." }, 402);
        if (!aiRes.ok || !aiRes.body)
          return json({ error: "A Luna não conseguiu responder agora." }, 500);

        const reader = aiRes.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let full = "";
        let buffer = "";

        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              if (full.trim()) {
                await supabase
                  .from("messages")
                  .insert({ trip_id: trip.id, role: "assistant", content: full });
              }
              controller.close();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  full += delta;
                  controller.enqueue(encoder.encode(delta));
                }
              } catch {
                // ignora chunks parciais
              }
            }
          },
          cancel() {
            void reader.cancel();
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      },
    },
  },
});
