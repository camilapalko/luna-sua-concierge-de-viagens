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

/**
 * Extrai os pedaços de texto (delta.content) de um bloco de linhas no
 * formato Server-Sent Events retornado pelo gateway de IA, acumulando
 * qualquer linha incompleta no `buffer` para a próxima chamada.
 */
function extractDeltas(buffer: string, chunk: string): { deltas: string[]; buffer: string } {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  const nextBuffer = lines.pop() ?? "";
  const deltas: string[] = [];
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
      if (delta) deltas.push(delta);
    } catch {
      // ignora chunks parciais que ainda não formam um JSON válido
    }
  }
  return { deltas, buffer: nextBuffer };
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

        const aiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${aiKey}`,
            },
            body: JSON.stringify({ model: MODEL, messages, stream: true, max_tokens: 8192 }),
          },
        );

        if (aiRes.status === 429)
          return json({ error: "Muitas mensagens em pouco tempo. Aguarde um instante." }, 429);
        if (aiRes.status === 401 || aiRes.status === 403)
          return json(
            { error: "Chave da IA inválida ou sem permissão. Verifique a GEMINI_API_KEY." },
            500,
          );
        if (!aiRes.ok || !aiRes.body)
          return json({ error: "A Luna não conseguiu responder agora." }, 500);

        // Importante: usamos tee() para separar o stream em duas cópias
        // independentes. Uma vai pro cliente (pra exibir a resposta em tempo
        // real); a outra é consumida aqui no servidor até o fim, INDEPENDENTE
        // de o cliente continuar conectado, e é ela quem grava a mensagem da
        // Luna no banco. Antes disso, se o usuário saísse da tela (trocasse
        // de aba, fechasse o app, navegasse pra "Minhas viagens") enquanto a
        // resposta ainda estava sendo gerada, o navegador cancelava a leitura
        // do stream, isso cancelava também a leitura vinda do gateway de IA
        // (porque os dois liam do mesmo reader), e a resposta da Luna nunca
        // era salva — na próxima vez que a viagem era aberta, a última
        // mensagem salva continuava sendo a do usuário, e o app disparava a
        // Luna de novo do zero, dando a impressão de que a conversa "voltou
        // pro início" e que nada tinha sido salvo.
        const [streamForClient, streamForPersistence] = aiRes.body.tee();

        void (async () => {
          const reader = streamForPersistence.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let full = "";
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const result = extractDeltas(buffer, chunk);
              buffer = result.buffer;
              full += result.deltas.join("");
            }
          } catch {
            // conexão com o gateway de IA caiu no meio; nada a persistir
          }
          if (full.trim()) {
            await supabase
              .from("messages")
              .insert({ trip_id: trip.id, role: "assistant", content: full });
          }
        })();

        const clientReader = streamForClient.getReader();
        const clientDecoder = new TextDecoder();
        const encoder = new TextEncoder();
        let clientBuffer = "";

        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            const { done, value } = await clientReader.read();
            if (done) {
              controller.close();
              return;
            }
            const chunk = clientDecoder.decode(value, { stream: true });
            const result = extractDeltas(clientBuffer, chunk);
            clientBuffer = result.buffer;
            for (const delta of result.deltas) {
              controller.enqueue(encoder.encode(delta));
            }
          },
          cancel() {
            // Cancelar o stream do cliente NÃO deve cancelar a leitura usada
            // pra persistir no banco (essa é independente, ver acima).
            void clientReader.cancel();
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
