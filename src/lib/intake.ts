export type Answers = Record<string, string | string[]>;

export type MilesProgram = { program: string; notes?: string };

export type IntakeQuestion = {
  id: string;
  prompt: string;
  type: "single" | "multi" | "text" | "dates";
  options?: string[];
  suggestions?: string[];
  placeholder?: string;
  label: string;
  skip?: (a: Answers) => boolean;
};

const isOnlyTours = (a: Answers) => a["service_type"] !== "Viagem Completa";

// Ordem pensada em blocos que fazem sentido conversar juntos, um assunto de
// cada vez, em vez de pular entre temas: (1) quem/o quê, (2) quando, (3) com
// quem, (4) orçamento, (5) logística de voo/hospedagem, (6) preferências de
// experiência, (7) pedidos finais. Isso evita, por exemplo, perguntar sobre
// flexibilidade de datas bem longe da pergunta de datas, ou perguntar
// orçamento em R$ e só muito depois perguntar de novo (com outras palavras)
// se a pessoa quer algo econômico ou de luxo.
export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: "service_type",
    label: "Tipo de serviço",
    prompt:
      "Oi! Eu sou a Luna ✨ Vou te ajudar a planejar algo inesquecível. Primeiro: você quer uma viagem completa (voos, hospedagem e roteiro) ou apenas passeios?",
    type: "single",
    options: ["Viagem Completa", "Apenas Passeios"],
  },
  {
    id: "origin",
    label: "Origem",
    prompt: "De onde você vai partir?",
    type: "text",
    placeholder: "Cidade de origem",
    suggestions: [
      "São Paulo",
      "Rio de Janeiro",
      "Belo Horizonte",
      "Brasília",
      "Salvador",
      "Curitiba",
      "Fortaleza",
      "Recife",
    ],
    skip: isOnlyTours,
  },
  {
    id: "destination",
    label: "Destino",
    prompt: "Para onde vamos? Pode ser um país, uma cidade ou uma região.",
    type: "text",
    placeholder: "Destino dos sonhos",
    suggestions: [
      "Europa",
      "Estados Unidos",
      "Japão",
      "Argentina",
      "Portugal",
      "Tailândia",
      "México",
      "Fernando de Noronha",
      "Nordeste Brasileiro",
      "Patagônia",
    ],
  },
  {
    id: "destination_specifics",
    label: "Lugares específicos",
    prompt:
      "Já tem cidades ou regiões específicas em mente dentro desse destino, ou prefere que eu monte a rota?",
    type: "text",
    placeholder: "Ex: Roma, Florença e Veneza",
    suggestions: ["Pode montar a rota pra mim", "Já sei quais lugares quero visitar"],
  },
  {
    id: "dates",
    label: "Datas",
    prompt: "Quais são as datas da viagem?",
    type: "dates",
  },
  {
    id: "trip_duration",
    label: "Duração da viagem",
    prompt: "Sem problema! Mais ou menos quantos dias você pretende viajar?",
    type: "text",
    placeholder: "Ex: 7 dias",
    suggestions: ["3 dias", "5 dias", "7 dias", "10 dias", "15 dias", "21 dias ou mais"],
    skip: (a) => a["dates"] !== "Datas ainda não definidas",
  },
  {
    id: "date_flexibility",
    label: "Flexibilidade de datas",
    prompt: "Suas datas são flexíveis?",
    type: "single",
    options: ["Datas fixas", "Flexível 1–3 dias", "Flexível 1 semana", "Bem flexível"],
    // Não faz sentido perguntar se as datas são flexíveis quando a pessoa
    // ainda nem escolheu quando vai viajar — essa pergunta só importa depois
    // que já existe uma data de referência para ser (in)flexível em torno dela.
    skip: (a) => isOnlyTours(a) || a["dates"] === "Datas ainda não definidas",
  },
  {
    id: "travelers",
    label: "Companhia",
    prompt: "Com quem você vai viajar?",
    type: "single",
    options: ["Sozinho(a)", "Em casal", "Família", "Amigos"],
  },
  {
    id: "num_travelers",
    label: "Número de viajantes",
    prompt: "Quantas pessoas viajam no total?",
    type: "text",
    placeholder: "Número de pessoas",
    suggestions: ["3", "4", "5", "6", "7", "8+"],
    skip: (a) => a["travelers"] === "Sozinho(a)" || a["travelers"] === "Em casal",
  },
  {
    id: "children_ages",
    label: "Idade das crianças",
    prompt: "Quantos filhos vão e qual a idade aproximada de cada um?",
    type: "text",
    placeholder: "Ex: 2 crianças, 5 e 8 anos",
    suggestions: [
      "Sem crianças",
      "1 criança pequena (0-4 anos)",
      "Crianças de 5-12 anos",
      "Adolescentes",
    ],
    skip: (a) => a["travelers"] !== "Família",
  },
  {
    id: "budget_per_person",
    label: "Orçamento por pessoa",
    prompt: "Qual o orçamento aproximado por pessoa?",
    type: "text",
    placeholder: "Ex: R$ 8.000",
    suggestions: [
      "Até R$ 3.000",
      "R$ 3.000 – R$ 6.000",
      "R$ 6.000 – R$ 10.000",
      "R$ 10.000 – R$ 20.000",
      "Acima de R$ 20.000",
    ],
  },
  {
    id: "budget",
    label: "Estilo de viagem",
    // Fica logo depois do orçamento em R$ de propósito: ali é "quanto",
    // aqui é "que tipo de experiência" (ex.: dá pra ter um orçamento alto e
    // ainda assim preferir uma viagem mais simples/econômica no estilo).
    prompt: "E dentro desse valor, qual estilo de viagem combina mais com você?",
    type: "single",
    options: ["Econômico", "Moderado", "Luxo", "Flexível"],
  },
  {
    id: "flight_time_pref",
    label: "Horário de voo",
    prompt: "Você prefere voar em qual horário?",
    type: "single",
    options: ["Manhã", "Tarde", "Noite", "Tanto faz"],
    skip: isOnlyTours,
  },
  {
    id: "airline_pref",
    label: "Preferência de companhia aérea",
    prompt: "Você tem alguma companhia aérea preferida?",
    type: "single",
    options: [
      "Só quero voar por uma companhia específica",
      "Tenho preferência, mas topo outra se for mais barata ou tiver horário melhor",
      "Sem preferência",
    ],
    skip: isOnlyTours,
  },
  {
    id: "airline_name",
    label: "Qual companhia",
    prompt: "Qual companhia?",
    type: "single",
    options: ["LATAM", "GOL", "Azul", "Companhia internacional"],
    skip: (a) => isOnlyTours(a) || a["airline_pref"] === "Sem preferência",
  },
  {
    id: "usar_milhas",
    label: "Uso de milhas",
    prompt: "Vi no seu perfil que você tem milhas cadastradas. Quer que eu considere usá-las nessa viagem?",
    type: "single",
    options: ["Sim, considere minhas milhas", "Não, prefiro comprar passagem", "Tanto faz"],
    // "__hasMiles" é preenchido na tela de chat a partir do perfil salvo (ver
    // chat.tsx) — não é uma pergunta visível, só um sinal pra saber se vale a
    // pena perguntar isso aqui.
    skip: (a) => isOnlyTours(a) || a["__hasMiles"] !== "yes",
  },
  {
    id: "connections_pref",
    label: "Conexões",
    prompt: "E sobre conexões?",
    type: "single",
    options: ["Só voo direto", "Aceito 1 conexão", "Aceito várias se for mais barato"],
    skip: isOnlyTours,
  },
  {
    id: "accommodation_type",
    label: "Hospedagem",
    prompt: "Que tipo de hospedagem combina mais com você?",
    type: "single",
    options: ["Hotel", "Resort", "Apartamento/Airbnb", "Pousada boutique", "Hostel"],
    skip: isOnlyTours,
  },
  {
    id: "interests",
    label: "Interesses",
    prompt: "O que você mais quer viver nessa viagem? (pode escolher vários)",
    type: "multi",
    options: [
      "Cultura & História",
      "Natureza & Aventura",
      "Gastronomia",
      "Relaxamento",
      "Vida Noturna",
      "Compras",
      "Parques Temáticos & Diversão",
    ],
  },
  {
    id: "travel_pace",
    label: "Ritmo",
    prompt: "Qual ritmo você prefere no dia a dia?",
    type: "single",
    options: ["Relaxado", "Moderado", "Intenso"],
  },
  {
    id: "dietary_restrictions",
    label: "Restrições alimentares",
    prompt: "Alguma restrição alimentar que eu deva considerar?",
    type: "multi",
    options: ["Vegetariano", "Vegano", "Sem Glúten", "Sem Lactose", "Halal", "Kosher", "Nenhuma"],
  },
  {
    id: "special_requests",
    label: "Pedidos especiais",
    prompt: "Por último: tem algum pedido especial ou ocasião para celebrar?",
    type: "text",
    placeholder: "Escreva aqui (ou escolha uma sugestão)",
    suggestions: [
      "Lua de mel",
      "Aniversário",
      "Viagem com crianças",
      "Acessibilidade necessária",
      "Viagem de trabalho",
      "Nada especial",
    ],
  },
];

// Opção "exclusiva" dentro de uma pergunta de múltipla escolha: marcá-la
// desmarca todo o resto (e vice-versa). Hoje só "Nenhuma" em restrições
// alimentares precisa disso — sem essa regra dava pra selecionar "Vegano" e
// "Nenhuma" ao mesmo tempo, mandando pra Luna um perfil contraditório.
const EXCLUSIVE_OPTIONS: Record<string, string> = {
  dietary_restrictions: "Nenhuma",
};

export function exclusiveOptionFor(questionId: string): string | undefined {
  return EXCLUSIVE_OPTIONS[questionId];
}

export function toggleMultiOption(
  questionId: string,
  selected: string[],
  option: string,
): string[] {
  const exclusive = exclusiveOptionFor(questionId);
  if (!exclusive) {
    return selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
  }

  if (option === exclusive) {
    return selected.includes(exclusive) ? [] : [exclusive];
  }

  const withoutExclusive = selected.filter((item) => item !== exclusive);
  return withoutExclusive.includes(option)
    ? withoutExclusive.filter((item) => item !== option)
    : [...withoutExclusive, option];
}

export function visibleQuestions(answers: Answers): IntakeQuestion[] {
  return INTAKE_QUESTIONS.filter((q) => !q.skip?.(answers));
}

export function nextQuestionIndex(answers: Answers, from: number): number {
  for (let i = from; i < INTAKE_QUESTIONS.length; i++) {
    const q = INTAKE_QUESTIONS[i]!;
    if (!q.skip?.(answers)) return i;
  }
  return INTAKE_QUESTIONS.length;
}

export function formatAnswer(value: string | string[] | undefined): string {
  if (!value) return "—";
  return Array.isArray(value) ? value.join(", ") : value;
}

export function profileSummary(answers: Answers, milesPrograms: MilesProgram[] = []): string {
  const lines = INTAKE_QUESTIONS.filter((q) => answers[q.id] !== undefined).map(
    (q) => `- ${q.label}: ${formatAnswer(answers[q.id])}`,
  );

  // Só entra no resumo se a pessoa topou usar milhas nessa viagem — evita
  // mandar pra Luna um dado que ela nem vai usar quando a resposta foi
  // "prefiro comprar passagem" ou "tanto faz".
  if (answers["usar_milhas"] === "Sim, considere minhas milhas" && milesPrograms.length > 0) {
    const milesLine = milesPrograms
      .map((m) => (m.notes ? `${m.program} (${m.notes})` : m.program))
      .join(", ");
    lines.push(`- Milhas disponíveis: ${milesLine}`);
  }

  return [
    "Aqui está o meu perfil de viagem:",
    ...lines,
    "",
    "Pode começar o planejamento comigo, uma etapa de cada vez.",
  ].join("\n");
}
