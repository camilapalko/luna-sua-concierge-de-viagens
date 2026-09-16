export const ITINERARY_MARKER = "# 🌟 SEU ROTEIRO COMPLETO";

export type ItineraryActivity = {
  kind: "voo" | "refeicao" | "passeio" | "transporte" | "hospedagem" | "outro";
  text: string;
  places: string[];
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
  linksVoos: string;
  linksTransporte: string;
  linksHospedagem: string;
  linksPasseios: string;
  checklist: string[];
  essencial: string;
  recomendacoes: string;
  dicas: string;
};

export function isItineraryMessage(content: string): boolean {
  // Antes exigíamos que a mensagem começasse EXATAMENTE com o marcador. Só
  // que a Luna às vezes abre a resposta final com uma frase de transição
  // (ex.: "Você tem toda razão! Vamos detalhar tudo...") antes do roteiro
  // propriamente dito — isso fazia o roteiro nunca aparecer na aba "Viagem",
  // mesmo depois de completo no chat. Basta o marcador aparecer em algum
  // lugar da mensagem: o parseItinerary já ignora qualquer texto antes dele.
  return content.includes(ITINERARY_MARKER);
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

function pickAll(sections: Record<string, string>, keywords: string[]): string {
  return Object.keys(sections)
    .filter((k) => keywords.some((word) => k.includes(word)))
    .map((k) => sections[k] ?? "")
    .filter(Boolean)
    .join("\n\n");
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
        const places = Array.from(line.matchAll(/\{\{\s*LOCAL\s*:\s*([^}]*?)\s*\}\}/gi))
          .map((m) => m[1]?.trim() ?? "")
          .filter(Boolean);
        // Cada marcador vira o NOME do lugar no texto exibido (antes eles eram
        // apagados, o que deixava buracos do tipo "caminhada pelo ."). Usamos
        // uma regex nova a cada linha porque regex global guarda lastIndex e,
        // reutilizada entre matchAll/replace, pulava ocorrências — era isso que
        // deixava o segundo {{LOCAL: ...}} da mesma linha visível como texto cru.
        const text = line
          .replace(/^[-*]\s*/, "")
          .replace(/\[(voo|refei[cç][aã]o|passeio|transporte|hospedagem)\]\s*/i, "")
          .replace(/\{\{\s*LOCAL\s*:\s*([^}]*?)\s*\}\}/gi, (_m, name: string) =>
            (name.split(",")[0] ?? "").trim(),
          )
          .replace(/\s+([.,;:!?])/g, "$1")
          .replace(/\s{2,}/g, " ")
          .trim();
        return { kind: activityKind(line), text, places };
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

// Divide o corpo da seção "Links para Reservas" pelos subtítulos de nível 3
// (### Voos, ### Hospedagem, ### Passeios), do mesmo jeito que parseDays faz
// para os dias do roteiro. Antes a separação por grupo era feita filtrando
// linhas por palavra-chave (ex.: /passeio|tour|ticket/i) — mas isso quebra
// sempre que o nome do provedor não contém uma dessas palavras (ex.:
// "GetYourGuide" não tem "tour" nem "passeio"), fazendo a aba correspondente
// mostrar só os títulos soltos, sem nenhum link. Separar por subtítulo real
// não depende do texto do link.
function splitSubsections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = body.split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const title = normalize(newline === -1 ? part : part.slice(0, newline));
    const content = newline === -1 ? "" : part.slice(newline + 1).trim();
    sections[title] = content;
  }
  return sections;
}

export function parseItinerary(content: string): Itinerary {
  const sections = splitSections(content);
  const linkGroups = splitSubsections(pick(sections, ["links"]));
  return {
    raw: content,
    documentacao: pick(sections, ["documentacao", "requisitos"]),
    hospedagem: pick(sections, ["hospedagem"]),
    dias: parseDays(pick(sections, ["roteiro dia", "dia a dia"])),
    restaurantes: pick(sections, ["restaurante"]),
    links: pick(sections, ["links"]),
    linksVoos: pick(linkGroups, ["voo"]),
    linksTransporte: pickAll(linkGroups, ["voo", "onibus", "carro"]),
    linksHospedagem: pick(linkGroups, ["hosped"]),
    linksPasseios: pick(linkGroups, ["passeio"]),
    checklist: parseChecklist(pick(sections, ["checklist"])),
    essencial: pick(sections, ["essencial"]),
    recomendacoes: pick(sections, ["recomenda"]),
    dicas: pick(sections, ["dicas"]),
  };
}

// O marcador "# 🌟 SEU ROTEIRO COMPLETO" sozinho não garante roteiro pronto:
// a IA às vezes usa o cabeçalho certo mas inventa uma estrutura de seções
// diferente (ex.: "## 📅 Roteiro Detalhado" em vez de "Roteiro Dia a Dia") e
// omite seções obrigatórias. Esta função reusa os MESMOS critérios de busca
// por palavra-chave do parseItinerary para conferir que as seções exigidas
// existem de verdade — e que "Roteiro Dia a Dia" tem pelo menos um "### Dia N".
export function hasRequiredItinerarySections(content: string): boolean {
  const sections = splitSections(content);
  const has = (keywords: string[]) =>
    Object.keys(sections).some((k) => keywords.some((word) => k.includes(word)));
  if (!has(["documentacao", "requisitos"])) return false;
  if (!has(["essencial"])) return false;
  if (!has(["recomenda"])) return false;
  if (!has(["links"])) return false;
  const diasBody = pick(sections, ["roteiro dia", "dia a dia"]);
  if (!diasBody) return false;
  if (parseDays(diasBody).length < 1) return false;
  return true;
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

// Extrai os nomes (texto alt) de cada imagem markdown ![nome](url) de um
// trecho — usado pra saber quais lugares (hotéis/restaurantes) têm foto
// resolvida, e assim buscar as coordenadas deles pra desenhar o mapa.
export function extractImageNames(body: string): string[] {
  const names: string[] = [];
  const regex = /!\[([^\]]+)\]\([^)]+\)/g;
  let match = regex.exec(body);
  while (match) {
    names.push(match[1]!);
    match = regex.exec(body);
  }
  return names;
}
