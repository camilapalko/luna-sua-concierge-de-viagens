// URL pública e definitiva do site publicado (não a do editor/preview da
// Lovable). Isso importa especialmente para links que são compartilhados
// fora do app: se a pessoa gerar o link estando no domínio de preview da
// Lovable (id-preview--...lovable.app), quem abrir esse link cairia no
// login da própria Lovable (o projeto é privado lá), em vez de ver o
// roteiro. Usar essa constante em vez de window.location.origin garante que
// o link sempre aponta pro domínio público de verdade.
export const SITE_URL =
  (import.meta.env["VITE_SITE_URL"] as string | undefined) ||
  "https://luna-travel-concierge.lovable.app";
