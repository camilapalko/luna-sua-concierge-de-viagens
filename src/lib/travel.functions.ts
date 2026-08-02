import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// IDs de afiliado ainda não disponíveis. Estrutura pronta: quando existirem,
// basta preencher as variáveis de ambiente — sem quebrar os links atuais.
function withAffiliate(url: string, param: string, id: string | undefined): string {
  if (!id) return url;
  const u = new URL(url);
  u.searchParams.set(param, id);
  return u.toString();
}

const MODEL = "google/gemini-3.6-flash";

async function askJson(prompt: string, schemaHint: string): Promise<unknown> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Serviço de IA indisponível no momento.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Você é uma pesquisadora de viagens. Responda SOMENTE com JSON válido no formato: ${schemaHint}. Use conhecimento atualizado de mercado e estimativas realistas em reais (BRL).`,
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      // Busca na web em tempo real (sem APIs pagas de voo/hospedagem)
      plugins: [{ id: "web", max_results: 5 }],
    }),
  });

  if (res.status === 429)
    throw new Error("Muitas buscas em pouco tempo. Tente novamente em instantes.");
  if (res.status === 402)
    throw new Error("Os créditos de IA acabaram. Adicione créditos para continuar.");
  if (!res.ok) throw new Error(`Falha na busca (${res.status}).`);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Não consegui interpretar o resultado da busca.");
  }
}

export type FlightOption = {
  airline: string;
  departure: string;
  arrival: string;
  duration: string;
  stops: string;
  price: string;
};

export const searchFlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      origin: string;
      destination: string;
      dates?: string;
      passengers?: string;
      preferences?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const result = (await askJson(
      `Busque 3 opções de voo de ${data.origin} para ${data.destination}. Datas: ${data.dates ?? "flexíveis"}. Passageiros: ${data.passengers ?? "1"}. Preferências: ${data.preferences ?? "nenhuma"}.`,
      `{"options":[{"airline":string,"departure":string,"arrival":string,"duration":string,"stops":string,"price":string}]}`,
    )) as { options?: FlightOption[] };

    const q = encodeURIComponent(`${data.origin} para ${data.destination}`);
    return {
      options: (result.options ?? []).slice(0, 3),
      links: {
        googleFlights: withAffiliate(
          `https://www.google.com/travel/flights?q=${q}`,
          "aff",
          process.env["FLIGHT_AFFILIATE_ID"],
        ),
        kayak: withAffiliate(
          `https://www.kayak.com.br/flights?search=${q}`,
          "aff",
          process.env["FLIGHT_AFFILIATE_ID"],
        ),
        skyscanner: withAffiliate(
          `https://www.skyscanner.com.br/transport/flights?q=${q}`,
          "associateid",
          process.env["FLIGHT_AFFILIATE_ID"],
        ),
      },
    };
  });

export type StayOption = {
  name: string;
  type: string;
  location: string;
  pricePerNight: string;
  amenities: string[];
};

export const searchStays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      destination: string;
      dates?: string;
      guests?: string;
      style?: string;
      travelers?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const result = (await askJson(
      `Busque 4 opções de hospedagem em ${data.destination}. Datas: ${data.dates ?? "flexíveis"}. Estilo: ${data.style ?? "moderado"}. Hóspedes: ${data.guests ?? data.travelers ?? "não informado"}.`,
      `{"options":[{"name":string,"type":string,"location":string,"pricePerNight":string,"amenities":string[]}]}`,
    )) as { options?: StayOption[] };

    return {
      options: (result.options ?? []).slice(0, 4),
      links: {
        booking: withAffiliate(
          `https://www.booking.com/searchresults.pt-br.html?ss=${encodeURIComponent(data.destination)}`,
          "aid",
          process.env["BOOKING_AFFILIATE_ID"],
        ),
      },
    };
  });
