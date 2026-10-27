import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "gemini-3.6-flash";

export type Attraction = {
  name: string;
  category: string;
  blurb: string;
  photo: string;
};

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (const delay of [800, 1800, 3500]) {
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, delay));
    res = await fetch(url, init);
  }
  return res;
}

// Sugere atrações do destino (para o "deslize pra descobrir") e anexa uma
// foto real de cada uma. Nunca lança: em falha devolve lista vazia.
export const discoverAttractions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { destination: string; interests?: string[]; days?: string }) => input)
  .handler(async ({ data }): Promise<{ attractions: Attraction[] }> => {
    const aiKey = process.env["GEMINI_API_KEY"];
    const destination = data.destination.trim().slice(0, 120);
    if (!aiKey || !destination) return { attractions: [] };
    const interests = (data.interests ?? []).slice(0, 8).join(", ") || "variados";
    const days = (data.days ?? "").slice(0, 40) || "não informado";
    const prompt = `Liste 14 atrações/experiências reais e conhecidas para visitar em "${destination}", variadas (pontos turísticos, natureza, cultura, gastronomia, vida local), priorizando os interesses: ${interests}. Duração da viagem: ${days}. Devolva SOMENTE um JSON válido (sem markdown): um array de objetos {"name": nome oficial do lugar seguido de vírgula e a cidade, "category": uma palavra ou duas (ex.: "Cultura", "Natureza", "Gastronomia"), "blurb": frase curta em português do Brasil (máx. 110 caracteres) dizendo por que vale a pena}.`;
    try {
      const res = await fetchWithRetry(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            max_tokens: 4096,
            reasoning_effort: "low",
          }),
        },
      );
      if (!res.ok) {
        console.error(`discoverAttractions: HTTP ${res.status}`);
        return { attractions: [] };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "";
      const match = /\[[\s\S]*\]/.exec(content);
      if (!match) return { attractions: [] };
      const raw = JSON.parse(match[0]) as unknown;
      if (!Array.isArray(raw)) return { attractions: [] };
      const items = raw
        .filter(
          (x): x is { name: string; category?: unknown; blurb?: unknown } =>
            !!x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string",
        )
        .slice(0, 16);
      const { resolvePlacePhotoUrl } = await import("@/lib/places.server");
      const attractions = await Promise.all(
        items.map(async (it) => ({
          name: it.name.slice(0, 120),
          category: typeof it.category === "string" ? it.category.slice(0, 30) : "",
          blurb: typeof it.blurb === "string" ? it.blurb.slice(0, 160) : "",
          photo: await resolvePlacePhotoUrl(it.name),
        })),
      );
      return { attractions };
    } catch (error) {
      console.error("discoverAttractions: erro", error);
      return { attractions: [] };
    }
  });
