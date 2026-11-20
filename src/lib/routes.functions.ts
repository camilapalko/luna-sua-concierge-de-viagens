import { createServerFn } from "@tanstack/react-start";

const MODEL = "gemini-3.6-flash";

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (const delay of [800, 1800]) {
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, delay));
    res = await fetch(url, init);
  }
  return res;
}

// Sugere 3 rotas (1 a 3 cidades cada) quando o destino e amplo (pais, regiao,
// continente). Se o destino ja e uma cidade unica, devolve lista vazia e a
// tela segue sem perguntar. Nunca lanca: em falha devolve lista vazia.
export const suggestRoutes = createServerFn({ method: "POST" })
  .inputValidator((input: { destination: string; duration?: string; interests?: string[] }) => input)
  .handler(async ({ data }): Promise<{ routes: string[] }> => {
    const aiKey = process.env["GEMINI_API_KEY"];
    const destination = data.destination.trim().slice(0, 120);
    if (!aiKey || !destination) return { routes: [] };
    const duration = (data.duration ?? "").slice(0, 60) || "nao informada";
    const interests = (data.interests ?? []).slice(0, 8).join(", ") || "variados";
    const prompt = `Destino da viagem: "${destination}". Duracao: ${duration}. Interesses: ${interests}.
Se o destino for UMA unica cidade ou local especifico, responda exatamente {"broad":false,"routes":[]}.
Se for um pais, regiao ou continente, responda {"broad":true,"routes":[...]} com 3 opcoes de rota realistas para essa duracao, cada uma com 1 a 3 cidades proximas entre si, escritas assim: "Lisboa + Sintra" ou "Roma + Florenca + Veneza". Varie as opcoes (uma mais enxuta, uma mais completa, uma diferente). Responda SOMENTE o JSON, sem markdown.`;
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
            max_tokens: 1024,
            reasoning_effort: "low",
          }),
        },
      );
      if (!res.ok) {
        console.error(`suggestRoutes: HTTP ${res.status}`);
        return { routes: [] };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "";
      const match = /\{[\s\S]*\}/.exec(content);
      if (!match) return { routes: [] };
      const parsed = JSON.parse(match[0]) as { broad?: unknown; routes?: unknown };
      if (parsed.broad !== true || !Array.isArray(parsed.routes)) return { routes: [] };
      const routes = parsed.routes
        .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        .map((r) => r.trim().slice(0, 80))
        .slice(0, 3);
      return { routes };
    } catch (error) {
      console.error("suggestRoutes: erro", error);
      return { routes: [] };
    }
  });
