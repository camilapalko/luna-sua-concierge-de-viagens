-- Compartilhamento público do roteiro final (somente leitura, sem a conversa).
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS share_token TEXT,
  ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS itinerary_content TEXT;

-- Garante que cada token é único (permitindo múltiplos NULL antes de ativar o compartilhamento).
CREATE UNIQUE INDEX IF NOT EXISTS trips_share_token_idx
  ON public.trips (share_token)
  WHERE share_token IS NOT NULL;

-- Sem policy de RLS para anon aqui de propósito: a leitura pública do roteiro
-- compartilhado passa por um server function que usa o service role
-- (bypassa RLS) e devolve só destino/título/itinerary_content — nunca a
-- tabela messages nem o restante da linha de trips. Isso evita qualquer
-- necessidade de expor a tabela trips inteira para o papel anon.
