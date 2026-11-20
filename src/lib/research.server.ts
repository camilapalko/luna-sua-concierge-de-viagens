// Pesquisa na web (Google Search via Gemini) sobre os destinos da viagem, pra
// a Luna evitar atracoes fechadas e avisar de eventos/mudancas. Roda UMA vez
// por viagem (o resultado fica salvo no perfil, em "__research") e nunca
// quebra o chat: em qualquer falha ou demora devolve null.
const MODEL = "gemini-3.6-flash";

const IGNORED_SPECIFICS = ["Pode montar a rota pra mim", "Já sei quais lugares quero visitar"];

export function researchPlaces(profile: Record<string, unknown>): string[] {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const route = str(profile["route_choice"]);
  const specifics = str(profile["destination_specifics"]);
  const raw = route || (IGNORED_SPECIFICS.includes(specifics) ? "" : specifics);
  return raw
    .split(/\s*(?:\+|,|;|\be\b|\/)\s*/i)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function researchDestination(
  aiKey: string,
  places: string[],
  when: string,
): Promise<string | null> {
  if (places.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Hoje é ${today}. Pesquise na web informações ATUAIS e úteis para quem vai visitar: ${places.join(", ")}. Período da viagem: ${when || "não definido"}.
Liste em até 8 tópicos curtos, em português do Brasil: atrações principais fechadas ou em obras, eventos e festivais no período, dias/horários de funcionamento que costumam pegar turistas de surpresa, greves ou avisos, taxas ou regras novas, e o que precisa ser reservado com antecedência. Seja objetivo e só inclua o que encontrar com confiança. Se não achar nada relevante, responda apenas SEM_INFO.`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": aiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error(`researchDestination: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text || /SEM_INFO/.test(text)) return null;
    return text.slice(0, 2500);
  } catch (error) {
    console.error("researchDestination: erro", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
