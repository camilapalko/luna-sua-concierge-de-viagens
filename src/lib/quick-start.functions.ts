import { createServerFn } from "@tanstack/react-start";
import { INTAKE_QUESTIONS, type Answers } from "@/lib/intake";

const MODEL = "gemini-3.6-flash";

// Campos que o modo "conte com suas palavras" tenta preencher de uma vez só,
// a partir de uma frase livre (ex.: "lua de mel de 5 dias em Paris, orcamento
// alto, focada em gastronomia"). As opcoes validas de cada campo vem direto
// de INTAKE_QUESTIONS (fonte unica), assim os chips de ideia pronta e o modo
// texto livre nunca ficam com listas de opcoes diferentes por engano.
function optionsFor(id: string): string[] {
  return INTAKE_QUESTIONS.find((q) => q.id === id)?.options ?? [];
}

const ALLOWED_VALUES: Record<string, string[]> = {
  service_type: optionsFor("service_type"),
  travelers: optionsFor("travelers"),
  budget: optionsFor("budget"),
  interests: optionsFor("interests"),
};

const FREE_TEXT_FIELDS = ["origin", "destination", "trip_duration"];

export type QuickStartAnswers = Partial<Answers>;

// So aceita de volta exatamente os valores que ja existem nas opcoes reais
// do intake (ou texto livre nos poucos campos que sao texto livre) -- nunca
// confia cegamente no JSON que a IA devolveu. Mesmo principio de seguranca
// ja usado pros links de afiliado (ALLOWED_LINK_DOMAINS em itinerary.ts):
// nunca deixar a IA inventar um valor fora de uma lista fechada conhecida.
function sanitize(raw: unknown): QuickStartAnswers {
  if (!raw || typeof raw !== "object") return {};
  const result: QuickStartAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (FREE_TEXT_FIELDS.includes(key) && typeof value === "string" && value.trim()) {
      result[key] = value.trim();
      continue;
    }
    const allowed = ALLOWED_VALUES[key];
    if (!allowed || allowed.length === 0) continue;
    if (key === "interests" && Array.isArray(value)) {
      const filtered = value.filter(
        (v): v is string => typeof v === "string" && allowed.includes(v),
      );
      if (filtered.length > 0) result[key] = filtered;
      continue;
    }
    if (typeof value === "string" && allowed.includes(value)) {
      result[key] = value;
    }
  }
  return result;
}

// Interpreta uma descricao livre de viagem e devolve so os campos que a IA
// conseguiu identificar com confianca -- nunca lanca erro pro chamador (uma
// falha aqui e so "nao preencheu nada", nunca deve travar o intake normal).
export const parseQuickStart = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => input)
  .handler(async ({ data }): Promise<QuickStartAnswers> => {
    const aiKey = process.env["GEMINI_API_KEY"];
    const text = data.text.trim();
    if (!aiKey || !text) return {};

    // Interpola as opcoes REAIS de cada campo (as mesmas de INTAKE_QUESTIONS)
    // direto no prompt, em vez de reescreve-las a mao aqui -- assim nunca
    // existe risco de a instrucao pedir um valor (ex.: sem acento) que depois
    // o sanitize() rejeita por nao bater com a lista oficial (com acento).
    const quoted = (values: string[]) => values.map((v) => `"${v}"`).join(", ");
    const prompt = `Extraia dessa descricao de viagem os campos que puder identificar com confianca, e devolva SOMENTE um JSON valido (sem markdown, sem comentario), com estas chaves opcionais:
- "service_type": um destes valores exatos: ${quoted(ALLOWED_VALUES["service_type"] ?? [])}
- "origin": cidade de origem, texto livre (so se mencionada)
- "destination": destino, texto livre
- "trip_duration": duracao aproximada, texto livre (ex.: "5 dias")
- "travelers": um destes valores exatos: ${quoted(ALLOWED_VALUES["travelers"] ?? [])}
- "budget": um destes valores exatos: ${quoted(ALLOWED_VALUES["budget"] ?? [])}
- "interests": lista com um ou mais destes valores exatos: ${quoted(ALLOWED_VALUES["interests"] ?? [])}

Omita qualquer campo que nao conseguir inferir com confianca da descricao. Nunca invente um valor fora das opcoes listadas -- copie o valor EXATAMENTE como aparece acima, com acentos e tudo.

Descricao: "${text}"`;

    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            max_tokens: 400,
            reasoning_effort: "low",
          }),
        },
      );
      if (!res.ok) return {};
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const match = /\{[\s\S]*\}/.exec(content);
      if (!match) return {};
      const parsed = JSON.parse(match[0]) as unknown;
      return sanitize(parsed);
    } catch {
      return {};
    }
  });
