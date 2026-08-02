export const ITINERARY_MARKER = "# 🌟 SEU ROTEIRO COMPLETO";

export type ItineraryActivity = {
  kind: "voo" | "refeicao" | "passeio" | "transporte" | "hospedagem" | "outro";
  text: string;
};

export type ItineraryDay = {
  title: string;
  activities: ItineraryActivity[];
};

export type Itinerary = {
  raw: string;
  documentacao: string;
  hospedagem: string;
  dias: ItineraryDay[];
  restaurantes: string;
  links: string;
  checklist: string[];
  essencial: string;
  dicas: string;
};

export function isItineraryMessage(content: string): boolean {
  return content.trimStart().startsWith(ITINERARY_MARKER);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/gi, "")
    .trim()
    .toLowerCase();
}

function splitSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = content.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const title = normalize(newline === -1 ? part : part.slice(0, newline));
    const body = newline === -1 ? "" : part.slice(newline + 1).trim();
    sections[title] = body;
  }
  return sections;
}

function pick(sections: Record<string, string>, keywords: string[]): string {
  const key = Object.keys(sections).find((k) => keywords.some((word) => k.includes(word)));
  return key ? (sections[key] ?? "") : "";
}

function activityKind(line: string): ItineraryActivity["kind"] {
  const match = /\[(voo|refei[cç][aã]o|passeio|transporte|hospedagem)\]/i.exec(line);
  const value = normalize(match?.[1] ?? "");
  if (value === "voo") return "voo";
  if (value.startsWith("refei")) return "refeicao";
  if (value === "passeio") return "passeio";
  if (value === "transporte") return "transporte";
  if (value === "hospedagem") return "hospedagem";
  return "outro";
}

function parseDays(body: string): ItineraryDay[] {
  const chunks = body.split(/^###\s+/m).slice(1);
  return chunks.map((chunk) => {
    const newline = chunk.indexOf("\n");
    const title = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
    const rest = newline === -1 ? "" : chunk.slice(newline + 1);
    const activities = rest
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-") || line.startsWith("*"))
      .map((line) => {
        const text = line
          .replace(/^[-*]\s*/, "")
          .replace(/\[(voo|refei[cç][aã]o|passeio|transporte|hospedagem)\]\s*/i, "")
          .trim();
        return { kind: activityKind(line), text };
      })
      .filter((a) => a.text.length > 0);
    return { title, activities };
  });
}

function parseChecklist(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s*(\[[ xX]\])?/.test(line))
    .map((line) => line.replace(/^[-*]\s*(\[[ xX]\])?\s*/, "").trim())
    .filter(Boolean);
}

export function parseItinerary(content: string): Itinerary {
  const sections = splitSections(content);
  return {
    raw: content,
    documentacao: pick(sections, ["documentacao", "requisitos"]),
    hospedagem: pick(sections, ["hospedagem"]),
    dias: parseDays(pick(sections, ["roteiro dia", "dia a dia"])),
    restaurantes: pick(sections, ["restaurante"]),
    links: pick(sections, ["links"]),
    checklist: parseChecklist(pick(sections, ["checklist"])),
    essencial: pick(sections, ["essencial"]),
    dicas: pick(sections, ["dicas"]),
  };
}

export function findLatestItinerary(
  messages: Array<{ role: string; content: string }>,
): Itinerary | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === "assistant" && isItineraryMessage(message.content)) {
      return parseItinerary(message.content);
    }
  }
  return null;
}

export function extractLinks(body: string): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match = regex.exec(body);
  while (match) {
    links.push({ label: match[1]!, url: match[2]! });
    match = regex.exec(body);
  }
  return links;
}
