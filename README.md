# Luna: Sua Concierge de Viagens

Construa a "Luna" — uma concierge digital de viagens com IA, em português do Brasil. É a reconstrução de um projeto que já existia em outra plataforma (Base44); abaixo está o produto completo já validado, incluindo as correções que precisam ser aplicadas nesta versão nova.

## Identidade visual
- Cor principal (Serenity): #4A819A
- Lavanda: #E6E6FA
- Dourado: #F4E3B2
- Branco: #FFFFFF
- Fonte de títulos: 'Cormorant Garamond' (serif, elegante)
- Fonte de corpo: 'Plus Jakarta Sans'
- Tom visual: clean, acolhedor, premium, com cantos arredondados (rounded-xl/2xl), sombras suaves, gradiente sutil de fundo branco para lavanda.
- Nome do produto: "Luna" com ícone de sparkles (✨). Logo simples: círculo com ícone de sparkles na cor Serenity.

## Stack e infraestrutura
- Use Supabase (Auth + Postgres) como backend.
- Autenticação por email/senha (ou magic link) via Supabase Auth. IMPORTANTE: a etapa de intake (perguntas iniciais) NÃO deve exigir login — só peça login no momento de salvar/continuar a conversa com a IA. Se um usuário não autenticado tentar acessar "Minhas Viagens", redirecione para o login em vez de mostrar uma lista vazia silenciosamente.
- Banco de dados: uma tabela `trips` (ou `conversations`) com: id, user_id, destination (texto), status (enum: planejando/finalizada), created_at, e uma tabela `messages` relacionada (id, trip_id, role: user/assistant, content texto, created_at). RLS: cada usuário só vê suas próprias trips/messages.
- O chat com a IA deve rodar via uma Edge Function que injeta o system prompt da Luna (abaixo) e faz streaming da resposta salvando as mensagens no banco.

## Páginas
1. **Home** — landing page: hero com título "Viagens inteligentes, memórias inesquecíveis", descrição da Luna, botão "Começar meu planejamento" (vai para /chat) e "Minhas viagens" (vai para /minhas-viagens, exige login). Seção "Como funciona" em 3 passos (Conte seus desejos / Receba sugestões personalizadas / Valide e aproveite). Seção de FAQ (perguntas: como funciona, quanto custa, a Luna faz reserva, viagens internacionais, quanto tempo leva, posso mudar depois).
2. **Chat** (/chat) — fluxo de intake conversacional (sem exigir login) seguido de chat livre com a Luna (exige login pra continuar). O intake é uma sequência de perguntas em formato de chat com opções clicáveis (chips/botões), pulando perguntas que não se aplicam (ver lista completa de perguntas abaixo). Ao final do intake, cria a trip no banco e a Luna inicia a conversa já contextualizada com o perfil coletado.
3. **Minhas Viagens** (/minhas-viagens, exige login) — lista de viagens em cards (destino, status, data de criação), clicando abre a viagem com duas abas: "Chat" (continuar a conversa) e "Viagem" (roteiro final formatado, quando a Luna já tiver enviado o roteiro completo).

## Perguntas do intake (em ordem, com lógica condicional)
1. service_type (única escolha): "Viagem Completa" ou "Apenas Passeios"
2. origin (texto com sugestões: São Paulo, Rio de Janeiro, Belo Horizonte, Brasília, Salvador, Curitiba, Fortaleza, Recife) — PULAR se service_type != "Viagem Completa"
3. destination (texto com sugestões: Europa, Estados Unidos, Japão, Argentina, Portugal, Tailândia, México, Fernando de Noronha, Nordeste Brasileiro, Patagônia)
4. dates (seletor de intervalo de datas)
5. travelers (única escolha): Sozinho(a) / Em casal / Família / Amigos
6. num_travelers (texto com sugestões 3,4,5,6,7,8+) — PULAR se travelers for "Sozinho(a)" ou "Em casal" (nesses casos já sabemos que é 1 ou 2 pessoas)
7. budget_per_person (texto com sugestões de faixas de valor em reais)
8. flight_time_pref, airline_pref, connections_pref, date_flexibility, accommodation_type — PULAR todas se service_type for "Apenas Passeios"
9. budget (estilo de viagem, única escolha): Econômico / Moderado / Luxo / Flexível
10. interests (múltipla escolha): Cultura & História / Natureza & Aventura / Gastronomia / Relaxamento / Vida Noturna / Compras
11. travel_pace (única escolha): Relaxado / Moderado / Intenso
12. dietary_restrictions (múltipla escolha): Vegetariano / Vegano / Sem Glúten / Sem Lactose / Halal / Kosher / Nenhuma
13. special_requests (texto livre com sugestões: Lua de mel, Aniversário, Viagem com crianças, Acessibilidade necessária, etc)

## Personalidade e regras da Luna (system prompt — usar como base do prompt da IA)
Você é Luna, uma concierge digital de viagens inteligente, acolhedora, estratégica e altamente resolutiva. Ajuda pessoas a planejarem viagens completas ou roteiros personalizados, criando uma experiência fluida, encantadora e organizada. Atua como uma amiga experiente que ama planejar viagens. Trabalha sempre em etapas, aguardando validação do usuário antes de avançar, nunca entrega tudo de uma vez.

Regras críticas:
- NUNCA envie links de reserva durante a conversa — apresente só informações (preço, horário, descrição). Links de reserva SÓ aparecem na seção final "LINKS PARA RESERVAS" dentro do roteiro completo.
- Personalize SEMPRE com base no perfil: filtre passeios pelos interesses, ajuste quantidade de atividades por dia conforme o ritmo de viagem (relaxado: 1-2/dia, moderado: 2-3/dia, intenso: 3-5/dia), e filtre restaurantes pelas restrições alimentares (indicando quais restrições cada um atende).
- Ao buscar voos: pergunte UMA coisa de cada vez (horário preferido → companhia aérea → conexões → flexibilidade de datas), com opções clicáveis, esperando resposta antes de avançar.
- Pergunte sobre transporte local (carro alugado/táxi/uber/transporte público) e transfer do aeroporto, sugerindo a melhor opção com justificativa.
- Se for viagem com múltiplos destinos, trate um destino de cada vez, com resumo ao final de cada um antes de avançar pro próximo.
- Sempre inclua imagens reais (buscadas na web) para hotéis, passeios e restaurantes usando markdown `![descrição](url)`.
- Antes de sugerir passeios, pergunte se o usuário quer atividades todos os dias ou prefere dias livres.
- O roteiro final (mensagem que começa com "# 🌟 SEU ROTEIRO COMPLETO") deve ter: Documentação e Requisitos, Roteiro Dia a Dia, Lista de Restaurantes (filtrada por restrição alimentar), Links para Reservas (voos/hospedagem/passeios — só aparecem aqui), Checklist Personalizado, Essencial (apps/contatos/dicas), Dicas Finais. Deve ser objetivo: máximo 3 opções por categoria, máximo 3 atividades por dia no roteiro, máximo 15 itens no checklist.

## Busca de voos e hospedagem
Implemente como Edge Functions que chamam um modelo de IA com acesso a busca na web (sem usar Amadeus ou qualquer API paga de voos por enquanto — isso ainda não está disponível). A function de voos deve retornar 3 opções com companhia aérea, horário, duração, escalas e preço estimado, e gerar links genéricos de busca (Google Flights, Kayak, Skyscanner) — SEM parâmetros de afiliado por enquanto. A function de hospedagem deve retornar 3-4 opções (nome, tipo, localização, preço/noite, comodidades) com link de busca do Booking.com — também SEM parâmetro de afiliado por enquanto (não temos IDs de afiliado ainda; deixe a estrutura pronta para adicionar depois, mas sem quebrar o link se o ID estiver vazio).

## Renderização do roteiro final
Quando a Luna enviar a mensagem com "# 🌟 SEU ROTEIRO COMPLETO", renderize de forma bonita (não como texto cru): seções colapsáveis para Documentação, Roteiro Dia a Dia (timeline visual com ícones por tipo de atividade: voo/refeição/passeio/transporte), Lista de Restaurantes, uma área com abas (Transporte / Hospedagem / Passeios / Documentos / Checklist / Essencial) com cards e botão "Ver opções" linkando pra busca correspondente, Checklist com itens marcáveis, e Dicas Finais em destaque. Essa mesma renderização deve aparecer tanto na aba "Chat" quanto na aba "Viagem" de uma trip salva — não duplique lógica, aba "Viagem" deve reaproveitar a mesma extração de dados da última mensagem de roteiro completo (não dependa de campos de metadata separados que nunca são preenchidos — extraia tudo direto do texto da mensagem).

## Import de design
Se for possível, comece o projeto já com paleta de cores e tipografia configuradas no Tailwind/tema (cores customizadas Serenity/Lavender/Gold, fontes Cormorant Garamond + Plus Jakarta Sans do Google Fonts).

Comece pela estrutura de páginas, autenticação e o fluxo de intake funcionando ponta a ponta antes de refinar visual.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a1a07b3c-4baa-43d5-87c5-dac13bddbe58).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
