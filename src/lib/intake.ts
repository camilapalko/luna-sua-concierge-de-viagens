export type Answers = Record<string, string | string[]>;

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
    id: "flight_time_pref",
    label: "Horário de voo",
    prompt: "Você prefere voar em qual horário?",
    type: "single",
    options: ["Manhã", "Tarde", "Noite", "Tanto faz"],
    skip: isOnlyTours,
  },
  {
    id: "airline_pref",
    label: "Companhia aérea",
    prompt: "Tem alguma companhia aérea de preferência?",
    type: "single",
    options: ["LATAM", "GOL", "Azul", "Companhia internacional", "Sem preferência"],
    skip: isOnlyTours,
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
    id: "date_flexibility",
    label: "Flexibilidade de datas",
    prompt: "Suas datas são flexíveis?",
    type: "single",
    options: ["Datas fixas", "Flexível 1–3 dias", "Flexível 1 semana", "Bem flexível"],
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
    id: "budget",
    label: "Estilo de viagem",
    prompt: "Qual estilo de viagem você busca?",
    type: "single",
    options: ["Econômico", "Moderado", "Luxo", "Flexível"],
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

export function profileSummary(answers: Answers): string {
  const lines = INTAKE_QUESTIONS.filter((q) => answers[q.id] !== undefined).map(
    (q) => `- ${q.label}: ${formatAnswer(answers[q.id])}`,
  );
  return [
    "Aqui está o meu perfil de viagem:",
    ...lines,
    "",
    "Pode começar o planejamento comigo, uma etapa de cada vez.",
  ].join("\n");
}
