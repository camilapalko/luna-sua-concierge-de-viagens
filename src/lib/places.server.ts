// Busca fotos reais de lugares (hotéis, restaurantes) via Google Places API
// (New) e guarda o resultado em cache — tanto em banco (place_photos) quanto
// como arquivo no nosso próprio Storage, pra nunca reconsultar o Google pelo
// mesmo lugar duas vezes e pra nunca expor a API key do Google no HTML da
// página (o navegador do usuário só vê a URL do NOSSO storage).
//
// Server-only: usa a service role do Supabase e a chave do Google, nenhuma
// das duas pode vazar pro bundle do cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FOTO_MARKER = /\{\{FOTO:\s*([^}]+)\}\}/g;

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function loremflickrFallback(query: string): string {
  const keywords = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z, ]/g, "")
    .split(/[, ]+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(",")
    .toLowerCase();
  return `https://loremflickr.com/640/400/${keywords || "travel"}`;
}

type PlaceLookup = { photoUrl: string; placeId: string; lat: number | null; lng: number | null };

async function fetchFromGoogle(query: string, apiKey: string): Promise<PlaceLookup | null> {
  const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.location,places.photos",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!searchRes.ok) return null;
  const searchData = (await searchRes.json()) as {
    places?: Array<{
      id?: string;
      location?: { latitude?: number; longitude?: number };
      photos?: Array<{ name?: string }>;
    }>;
  };
  const place = searchData.places?.[0];
  const photoName = place?.photos?.[0]?.name;
  if (!place?.id || !photoName) return null;

  const photoRes = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=640&key=${apiKey}`,
  );
  if (!photoRes.ok) return null;
  const contentType = photoRes.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await photoRes.arrayBuffer());

  const extension = contentType.includes("png") ? "png" : "jpg";
  const path = `${place.id}.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("place-photos")
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) return null;

  // Buckets públicos estão bloqueados neste projeto, então geramos uma URL
  // assinada de longa duração (10 anos) — ela continua sendo servida pelo
  // nosso próprio storage, sem expor nenhuma chave do Google.
  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from("place-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signedError || !signed?.signedUrl) return null;

  return {
    photoUrl: signed.signedUrl,
    placeId: place.id,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
  };
}

async function resolveOne(rawQuery: string): Promise<string> {
  const query = rawQuery.trim();
  const cacheKey = normalizeQuery(query);
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];

  if (apiKey) {
    const { data: cached } = await supabaseAdmin
      .from("place_photos")
      .select("photo_url")
      .eq("query", cacheKey)
      .maybeSingle();
    if (cached?.photo_url) return cached.photo_url;

    try {
      const result = await fetchFromGoogle(query, apiKey);
      if (result) {
        await supabaseAdmin.from("place_photos").upsert(
          {
            query: cacheKey,
            google_place_id: result.placeId,
            photo_url: result.photoUrl,
            lat: result.lat,
            lng: result.lng,
          },
          { onConflict: "query" },
        );
        return result.photoUrl;
      }
    } catch {
      // silencioso: cai no fallback abaixo
    }
  }

  return loremflickrFallback(query);
}

// Troca cada marcador {{FOTO: Nome do Lugar, Cidade}} do roteiro por uma
// imagem markdown de verdade — com foto real do Google quando a busca
// funciona, ou a foto genérica por palavra-chave de antes quando não
// funciona (chave ausente, lugar não encontrado, erro de rede etc.). O
// roteiro NUNCA fica sem imagem por causa disso.
export async function resolvePlacePhotos(content: string): Promise<string> {
  const matches = Array.from(content.matchAll(FOTO_MARKER));
  if (matches.length === 0) return content;

  const uniqueQueries = Array.from(new Set(matches.map((m) => m[1]!.trim())));
  const resolved = new Map<string, string>();
  await Promise.all(
    uniqueQueries.map(async (query) => {
      resolved.set(query, await resolveOne(query));
    }),
  );

  return content.replace(FOTO_MARKER, (_match, name: string) => {
    const trimmed = name.trim();
    const url = resolved.get(trimmed) ?? loremflickrFallback(trimmed);
    return `![${trimmed}](${url})`;
  });
}

const LOCAL_MARKER = /\{\{LOCAL:\s*([^}]+)\}\}/g;

// Resolve marcadores {{LOCAL: Nome, Cidade}} usados nos passeios do roteiro
// dia a dia — só guarda coordenadas no cache (sem baixar foto, mais barato),
// pra alimentar o seletor de dia do mapa da viagem. NÃO reescreve o
// conteúdo: o marcador continua no texto salvo, e é removido só na hora de
// exibir (parseDays em itinerary.ts) — assim sempre dá pra re-derivar quais
// lugares aparecem em cada dia.
export async function resolvePlaceLocations(content: string): Promise<void> {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!apiKey) return;

  const matches = Array.from(content.matchAll(LOCAL_MARKER));
  if (matches.length === 0) return;

  const uniqueQueries = Array.from(new Set(matches.map((m) => m[1]!.trim())));
  await Promise.all(
    uniqueQueries.map(async (rawQuery) => {
      const query = rawQuery.trim();
      const cacheKey = normalizeQuery(query);
      const { data: cached } = await supabaseAdmin
        .from("place_photos")
        .select("query")
        .eq("query", cacheKey)
        .maybeSingle();
      if (cached) return;

      try {
        const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.location",
          },
          body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
        });
        if (!searchRes.ok) return;
        const searchData = (await searchRes.json()) as {
          places?: Array<{ id?: string; location?: { latitude?: number; longitude?: number } }>;
        };
        const place = searchData.places?.[0];
        if (!place?.id || !place.location) return;

        await supabaseAdmin.from("place_photos").upsert(
          {
            query: cacheKey,
            google_place_id: place.id,
            lat: place.location.latitude ?? null,
            lng: place.location.longitude ?? null,
          },
          { onConflict: "query" },
        );
      } catch {
        // silencioso: esse lugar só não aparece no mapa, sem quebrar nada
      }
    }),
  );
}
