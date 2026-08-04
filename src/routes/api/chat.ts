import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { LUNA_SYSTEM_PROMPT, buildContextPrompt } from "@/lib/luna-prompt";
import type { Database } from "@/integrations/supabase/types";

type Body = { tripId?: string; message?: string };

const MODEL = "gemini-3.6-flash";

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
        const aiKey = process.env["GEMINI_API_KEY"];
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
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
        if (historyError) return json({ error: historyError.message }, 500);

        const messages = [
          { role: "system", content: LUNA_SYSTEM_PROMPT },
          {
            role: "system",
            content: buildContextPrompt((trip.profile ?? {}) as unknown as Record<string, unknown>),
          },
          ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
        ];

        // Importante: chamamos a Gemini SEM streaming (stream: false) e
        // esperamos a resposta completa antes de fazer qualquer outra coisa.
        // Isso é proposital: em ambientes serverless/edge (como o Cloudflare
        // Workers, usado aqui), não há garantia de que um "trabalho em
        // segundo plano" (uma promise não aguardada) continue rodando depois
        // que a conexão original termina ou o cliente se desconecta. Ao
        // esperar a resposta inteira e SÓ DEPOIS gravar no banco e responder
        // ao cliente, garantimos que a mensagem nunca é perdida, não importa
        // o que aconteça com a conexão do usuário.
        const aiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${aiKey}`,
            },
            body: JSON.stringify({
              model: MODEL,
              messages,
              stream: false,
              max_tokens: 32768,
              reasoning_effort: "low",
            }),
          },
        );

        if (aiRes.status === 429)
          return json({ error: "Muitas mensagens em pouco tempo. Aguarde um instante." }, 429);
        if (aiRes.status === 401 || aiRes.status === 403)
          return json(
            { error: "Chave da IA inválida ou sem permissão. Verifique a GEMINI_API_KEY." },
            500,
          );
        if (!aiRes.ok) return json({ error: "A Luna não conseguiu responder agora." }, 500);

        const data = (await aiRes.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        const choice = data.choices?.[0];
        const full = choice?.message?.content ?? "";

        if (!full.trim()) {
          return json(
            { error: "A Luna não conseguiu responder agora. Tente enviar de novo." },
            500,
          );
        }

        await supabase
          .from("messages")
          .insert({ trip_id: trip.id, role: "assistant", content: full });

        return json({ content: full, truncated: choice?.finish_reason === "length" }, 200);
      },
    },
  },
});
