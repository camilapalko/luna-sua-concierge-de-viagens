import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { LUNA_SYSTEM_PROMPT, buildContextPrompt } from "@/lib/luna-prompt";
import {
  isItineraryMessage,
  ITINERARY_MARKER,
  hasRequiredItinerarySections,
} from "@/lib/itinerary";
import { resolvePlacePhotos, resolvePlaceLocations } from "@/lib/places.server";
import type { Database } from "@/integrations/supabase/types";

type Body = { tripId?: string; message?: string };

const MODEL = "gemini-3.6-flash";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

        // Importante: chamamos a Gemini SEM streaming (stream: false) e
        // esperamos a resposta completa antes de fazer qualquer outra coisa.
        // Isso é proposital: em ambientes serverless/edge (como o Cloudflare
        // Workers, usado aqui), não há garantia de que um "trabalho em
        // segundo plano" (uma promise não aguardada) continue rodando depois
        // que a conexão original termina ou o cliente se desconecta. Ao
        // esperar a resposta inteira e SÓ DEPOIS gravar no banco e responder
        // ao cliente, garantimos que a mensagem nunca é perdida, não importa
        // o que aconteça com a conexão do usuário.
        //
        // 65.536 tokens de saída é o teto FIXO do modelo gemini-3.6-flash —
        // não dá pra configurar um valor maior. Para roteiros muito longos
        // (ex: 15 dias, 6 pessoas) essa resposta pode cortar no meio. Quando
        // isso acontece (finish_reason indicando corte por limite de
        // tokens), fazemos automaticamente uma ou mais chamadas extras
        // pedindo pra Gemini continuar exatamente de onde parou, e juntamos
        // tudo antes de salvar/responder — o usuário nunca vê o corte.
        type AiMessage = { role: string; content: string };

        async function callGemini(conversation: AiMessage[]) {
          return fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${aiKey}`,
            },
            body: JSON.stringify({
              model: MODEL,
              messages: conversation,
              stream: false,
              max_tokens: 65536,
              reasoning_effort: "low",
            }),
          });
        }

        // A API da Gemini às vezes falha de forma transitória (5xx, sobrecarga
        // momentânea) mesmo com tudo certo do nosso lado. Antes, qualquer
        // falha assim já desistia na hora e mostrava um erro genérico sem
        // nenhuma pista do que aconteceu. Agora: (1) tentamos de novo uma vez
        // após uma pequena espera se for um erro 5xx, e (2) se ainda assim
        // falhar, incluímos o status HTTP e um trecho da resposta da Gemini
        // na mensagem de erro, para dar pra diagnosticar de verdade da
        // próxima vez, em vez de adivinhar.
        async function callGeminiWithRetry(conversation: AiMessage[]) {
          const first = await callGemini(conversation);
          if (first.status < 500) return first;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return callGemini(conversation);
        }

        const MAX_CONTINUATIONS = 3;
        const CONTINUE_INSTRUCTION =
          "Continue a resposta anterior EXATAMENTE de onde ela parou. Não repita nada do que já foi escrito, não reinicie o texto nem adicione saudações — apenas continue a partir da última palavra ou frase incompleta.";

        let conversation: AiMessage[] = [...messages];
        let full = "";
        let finishReason = "desconhecido";
        const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        let round = 0;

        while (round <= MAX_CONTINUATIONS) {
          const aiRes = await callGeminiWithRetry(conversation);

          if (aiRes.status === 429) {
            if (full.trim()) break;
            return json({ error: "Muitas mensagens em pouco tempo. Aguarde um instante." }, 429);
          }
          if (aiRes.status === 401 || aiRes.status === 403) {
            if (full.trim()) break;
            return json(
              { error: "Chave da IA inválida ou sem permissão. Verifique a GEMINI_API_KEY." },
              500,
            );
          }
          if (!aiRes.ok) {
            if (full.trim()) break;
            const bodyText = await aiRes.text().catch(() => "");
            const snippet = bodyText.slice(0, 300);
            return json(
              {
                error: `A Luna não conseguiu responder agora. (HTTP ${aiRes.status}${snippet ? `: ${snippet}` : ""})`,
              },
              500,
            );
          }

          const data = (await aiRes.json()) as {
            choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const choice = data.choices?.[0];
          const chunk = choice?.message?.content ?? "";
          finishReason = choice?.finish_reason ?? "desconhecido";

          if (data.usage) {
            totalUsage.prompt_tokens += data.usage.prompt_tokens ?? 0;
            totalUsage.completion_tokens += data.usage.completion_tokens ?? 0;
            totalUsage.total_tokens += data.usage.total_tokens ?? 0;
          }

          full += chunk;

          const normalizedReason = finishReason.toLowerCase().replace(/_/g, "");
          const isLengthCut = normalizedReason === "length" || normalizedReason === "maxtokens";

          if (!isLengthCut || round === MAX_CONTINUATIONS) break;

          // Próxima rodada: acrescenta o que já foi gerado como resposta do
          // assistente e pede pra continuar. Essas mensagens intermediárias
          // NÃO são salvas no banco — só o texto final concatenado vira uma
          // única mensagem no histórico da viagem.
          conversation = [
            ...conversation,
            { role: "assistant", content: chunk },
            { role: "user", content: CONTINUE_INSTRUCTION },
          ];
          round += 1;
        }

        if (!full.trim()) {
          return json(
            { error: `A Luna não conseguiu responder agora. (finish_reason: ${finishReason})` },
            500,
          );
        }

        // Rede de segurança: às vezes a Gemini ignora o formato oficial e fecha
        // a viagem com um resumo em texto livre. Sem o cabeçalho
        // "# 🌟 SEU ROTEIRO COMPLETO" a viagem fica presa em "Planejando" pra
        // sempre e fotos/mapa nunca são gerados. Quando a resposta claramente
        // PARECE um roteiro final mas não está no formato, pedimos silenciosamente
        // pra Gemini reescrever a MESMA informação no formato correto. O usuário
        // nunca vê a versão malformada — mesmo espírito das continuações por
        // corte de token acima.
        function looksLikeItineraryAttempt(text: string): boolean {
          const dayMatches = text.match(/(^|\n)\s*(#{1,4}\s*)?(\*\*)?\s*Dia\s+\d+/gi) ?? [];
          if (dayMatches.length >= 2) return true;
          const moneyCount = (text.match(/R\$\s?\d/g) ?? []).length;
          const mentionsTrip = /roteiro|viagem|itiner[áa]rio/i.test(text);
          if (mentionsTrip && moneyCount >= 3) return true;
          const hasClosingWords =
            /roteiro (completo|final|pronto)|tudo pronto|resumo (da|final)|plano (final|da viagem)|ficha (final|da viagem)/i.test(
              text,
            );
          if (hasClosingWords && text.length > 1500) return true;
          return false;
        }

        // O safety-net dispara em DOIS casos: (1) o marcador está ausente mas
        // o texto parece tentativa de fechamento, OU (2) o marcador está
        // presente mas a estrutura de seções está incompleta/inventada —
        // nesses casos a viagem passaria como "finalizada" sem documentação,
        // links, checklist etc.
        const needsReformat = isItineraryMessage(full)
          ? !hasRequiredItinerarySections(full)
          : looksLikeItineraryAttempt(full);

        if (needsReformat) {
          const REFORMAT_INSTRUCTION = `Sua resposta anterior fechou a viagem FORA do formato oficial do app. Reescreva tudo estritamente no formato oficial do roteiro completo, sem fazer nenhuma pergunta e sem nenhum comentário antes ou depois. A primeira linha deve ser exatamente "${ITINERARY_MARKER}", seguida das seções de nível 2 exigidas, com "### Dia N – ..." e os marcadores [voo]/[refeição]/[passeio]/[transporte].

IMPORTANTE — ANCORAGEM: mesmo que suas respostas anteriores nesta mesma conversa tenham usado títulos diferentes (ex.: "Roteiro Detalhado", "Resumo da Viagem", "Links Úteis", "Recomendações Importantes", tabelas de custo, ou qualquer outra estrutura própria), IGNORE esses títulos anteriores — eles estavam errados. Use exatamente os 9 títulos listados abaixo, com essas palavras e emojis exatos, nesta ordem exata, mesmo que isso signifique usar um título diferente do que você mesma usou antes nesta conversa:

## 📄 Documentação e Requisitos
## 🏨 Hospedagem Sugerida
## 🗓️ Roteiro Dia a Dia
## 🍽️ Lista de Restaurantes
## 🔗 Links para Reservas
## ✅ Checklist Personalizado
## 🧭 Essencial
## 🎒 Recomendações
## 💡 Dicas Finais

REGRAS:
1. Fatos concretos já decididos sobre ESSA viagem (cidades e rota, hospedagem sugerida, atividades do dia a dia já escritas, restaurantes, datas e valores) devem ser mantidos exatamente como estão — não invente, não troque e não remova nenhum desses fatos.
2. MAS as seções estruturais obrigatórias do formato (Documentação e Requisitos, Essencial, Recomendações, Links para Reservas, Dicas Finais) SEMPRE precisam ser preenchidas com conteúdo real, seguindo as regras de conteúdo de cada seção definidas no seu prompt do sistema — mesmo que a resposta anterior não tenha mencionado nada disso. Ou seja: documentação = passaporte/visto/vacinas + aviso de confirmar na fonte oficial; essencial = seguro viagem, câmbio, voltagem, idioma, fuso, telefone de emergência; recomendações = mala, costumes locais, segurança específica do destino; links = os links de busca genéricos padrão para os meios de transporte, hospedagem e passeios aplicáveis. Deixar qualquer uma dessas seções vazia, com "sem informações" ou com texto genérico é um erro de formatação tão grave quanto inventar fatos novos da viagem.
3. Cada atividade [passeio] deve ter NO MÁXIMO UM marcador {{LOCAL: Nome, Cidade}} por linha, sempre no final da linha, referente ao lugar principal daquela atividade — nunca vários marcadores {{LOCAL: ...}} dentro da mesma frase, e nunca no meio do texto.
4. "Essencial", "Recomendações" e "Dicas Finais" são TRÊS seções separadas, cada uma com seu próprio título "## ..." e conteúdo DIFERENTE. NUNCA junte duas ou três em um título só (ex.: "## 💡 Essencial, Recomendações e Dicas Finais" é erro) e NUNCA repita o mesmo parágrafo em mais de uma delas:
   - Essencial = seguro viagem, câmbio/dinheiro, voltagem, idioma, fuso horário, telefone de emergência. Ex.: "**Seguro viagem:** recomendado, com cobertura para aventura. / **Dinheiro:** leve R$ 300 em espécie. / **Voltagem:** 127V. / **Fuso:** igual a Brasília. / **Emergência:** 190 e 192."
   - Recomendações = mala conforme o clima, costumes locais, segurança específica do destino. Ex.: "**Mala:** roupas de secagem rápida e corta-vento. / **Costumes:** guias credenciados são exigidos nas trilhas. / **Segurança:** não entre nos poços com protetor solar."
   - Dicas Finais = economia e otimização da viagem. Ex.: "**Compre os voos com 2 a 3 meses de antecedência.** / **Feche os passeios em pacote** para baratear. / **Prefira pousada com café da manhã incluso.**"
5. DOMÍNIOS PERMITIDOS em "Links para Reservas" — os ÚNICOS links aceitos são exatamente estes, dois ou três por grupo aplicável, e SEMPRE inclua os grupos "### Seguro Viagem", "### Chip e Internet" e "### Transfer" (além dos grupos de transporte/hospedagem/passeios aplicáveis):
   - Voos: [Google Flights](https://www.google.com/travel/flights?q=voos%20de%20{ORIGEM}%20para%20{DESTINO}%20em%20{DATA}) e [Skyscanner](https://www.skyscanner.com.br/)
   - Ônibus: [ClickBus](https://www.clickbus.com.br/) (sempre só a home, sem tentar completar — o ClickBus exige o terminal exato, que não dá pra adivinhar) e [Buser](https://www.buser.com.br/onibus/{ORIGEM_SLUG}/{DESTINO_SLUG}?ida={DATA_IDA}) — {ORIGEM_SLUG}/{DESTINO_SLUG} são cidade+UF em minúsculas com hífen (ex.: "sao-paulo-sp"), {DATA_IDA} é a data real de ida (AAAA-MM-DD)
   - Carro Alugado: [Rentcars](https://www.rentcars.com/) e [Discover Cars](https://www.discovercars.com/)
   - Hospedagem: [Booking.com](https://www.booking.com/searchresults.pt-br.html?ss={NOME_HOSPEDAGEM}%2C%20{CIDADE}&checkin={DATA_CHECKIN}&checkout={DATA_CHECKOUT}) — use o nome exato do hotel/pousada principal recomendado e as datas reais de check-in/check-out (AAAA-MM-DD); repita uma linha por cidade/trecho se houver mais de uma hospedagem
   - Passeios: [GetYourGuide](https://www.getyourguide.com/s/?q={NOME_PASSEIO}%2C%20{CIDADE}), [Viator](https://www.viator.com/searchResults/all?text={NOME_PASSEIO}%2C%20{CIDADE}) e [Civitatis](https://www.civitatis.com/pt/) — use o nome exato do passeio mais recomendado nos dois primeiros; o Civitatis é SEMPRE só a página inicial, sem parâmetro (o Civitatis não tem busca por texto na URL e não segue um padrão previsível de código de cidade — nunca tente montar um link tipo civitatis.com/pt/{cidade}/)
   - Seguro Viagem: [Real Seguro Viagem](https://www.seguroviagem.srv.br/) e [Seguros Promo](https://www.segurospromo.com.br/)
   - Chip e Internet: [Airalo](https://www.airalo.com/{PAIS_SLUG}-esim) — {PAIS_SLUG} é o nome do país de destino EM INGLÊS, minúsculo, com hífen (ex.: Portugal="portugal", Estados Unidos="united-states", Brasil="brazil"); se a viagem for só dentro do Brasil, use https://www.airalo.com/ sem slug
   - Transfer: [Kiwitaxi](https://www.kiwitaxi.com/)
   NUNCA use um domínio fora dessa lista, mesmo que uma agência/empresa específica tenha sido mencionada em texto na conversa — o link sempre vai para um dos domínios acima.

Responda somente com o roteiro reformatado.`;

          try {
            const fixRes = await callGeminiWithRetry([
              ...conversation,
              { role: "assistant", content: full },
              { role: "user", content: REFORMAT_INSTRUCTION },
            ]);
            if (fixRes.ok) {
              const fixData = (await fixRes.json()) as {
                choices?: Array<{ message?: { content?: string } }>;
              };
              const fixed = fixData.choices?.[0]?.message?.content ?? "";
              // Só aceita o texto reformatado se ele passou nas duas validações:
              // marcador presente E estrutura de seções completa. Caso
              // contrário, mantém o `full` original (mesma lógica de falha
              // silenciosa: melhor salvar o que tem do que travar).
              if (
                fixed.trim() &&
                isItineraryMessage(fixed) &&
                hasRequiredItinerarySections(fixed)
              ) {
                full = fixed;
              }
            }
          } catch {
            // Falha silenciosa: melhor salvar o texto original do que travar a conversa.
          }
        }

        if (isItineraryMessage(full)) {
          full = await resolvePlacePhotos(full);
          await resolvePlaceLocations(full);
        }


        await supabase
          .from("messages")
          .insert({ trip_id: trip.id, role: "assistant", content: full });

        const normalizedFinal = finishReason.toLowerCase().replace(/_/g, "");
        const stillTruncated =
          (normalizedFinal === "length" || normalizedFinal === "maxtokens") && round >= MAX_CONTINUATIONS;

        return json(
          {
            content: full,
            truncated: stillTruncated,
            debug: { finishReason, usage: totalUsage, continuations: round },
          },
          200,
        );
      },
    },
  },
});
