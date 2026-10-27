import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Heart, X, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discoverAttractions, type Attraction } from "@/lib/discover.functions";

export function SwipeDiscover({
  destination,
  interests,
  days,
  onDone,
  onCancel,
}: {
  destination: string;
  interests?: string[];
  days?: string;
  onDone: (liked: string[]) => void;
  onCancel: () => void;
}) {
  const load = useServerFn(discoverAttractions);
  const [items, setItems] = useState<Attraction[] | null>(null);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [history, setHistory] = useState<boolean[]>([]);
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    load({ data: { destination, ...(interests ? { interests } : {}), ...(days ? { days } : {}) } })
      .then((r) => alive && setItems(r.attractions))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [load, destination, interests, days]);

  const current = items?.[index];
  const finished = items !== null && items.length > 0 && index >= items.length;

  const decide = (like: boolean) => {
    if (!current) return;
    setHistory((h) => [...h, like]);
    if (like) setLiked((l) => [...l, current.name]);
    setIndex((i) => i + 1);
    setDx(0);
  };
  const undo = () => {
    if (index === 0) return;
    const wasLike = history[history.length - 1];
    const prev = items?.[index - 1];
    setHistory((h) => h.slice(0, -1));
    if (wasLike && prev) setLiked((l) => l.filter((n) => n !== prev.name));
    setIndex((i) => i - 1);
  };

  return (
    <div className="mx-auto w-full max-w-sm rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Descubra atrações em {destination}</p>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={onCancel}>
          Pular
        </button>
      </div>

      {items === null && (
        <div className="flex h-72 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Buscando lugares incríveis…
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
          <p>Não consegui carregar as sugestões agora.</p>
          <Button variant="outline" className="rounded-xl" onClick={onCancel}>
            Continuar sem escolher
          </Button>
        </div>
      )}

      {current && (
        <>
          <div
            className="relative h-80 touch-pan-y select-none overflow-hidden rounded-2xl bg-muted"
            style={{
              transform: `translateX(${dx}px) rotate(${dx / 20}deg)`,
              transition: startX.current === null ? "transform 0.2s" : "none",
            }}
            onPointerDown={(e) => {
              startX.current = e.clientX;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (startX.current !== null) setDx(e.clientX - startX.current);
            }}
            onPointerUp={() => {
              const moved = dx;
              startX.current = null;
              if (moved > 90) decide(true);
              else if (moved < -90) decide(false);
              else setDx(0);
            }}
          >
            <img
              src={current.photo}
              alt={current.name}
              draggable={false}
              className="size-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
              {current.category && (
                <span className="mb-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
                  {current.category}
                </span>
              )}
              <p className="font-semibold leading-tight">{current.name.split(",")[0]}</p>
              <p className="mt-1 text-xs text-white/85">{current.blurb}</p>
            </div>
            {dx > 40 && (
              <span className="absolute left-3 top-3 rounded-lg border-2 border-green-400 px-2 py-1 text-sm font-bold text-green-400">
                QUERO
              </span>
            )}
            {dx < -40 && (
              <span className="absolute right-3 top-3 rounded-lg border-2 border-red-400 px-2 py-1 text-sm font-bold text-red-400">
                PULAR
              </span>
            )}
          </div>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 rounded-full"
              onClick={undo}
              disabled={index === 0}
              aria-label="Voltar"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-14 rounded-full border-red-300 text-red-500"
              onClick={() => decide(false)}
              aria-label="Pular"
            >
              <X className="size-6" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="size-14 rounded-full"
              onClick={() => decide(true)}
              aria-label="Quero"
            >
              <Heart className="size-6" />
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {index + 1} de {items?.length} · {liked.length} escolhida(s)
          </p>
          {liked.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="mt-1 w-full rounded-xl text-sm"
              onClick={() => onDone(liked)}
            >
              Concluir com {liked.length} escolhida(s)
            </Button>
          )}
        </>
      )}

      {finished && (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm">
            Você escolheu <strong>{liked.length}</strong> atrações!
          </p>
          <Button className="rounded-xl" onClick={() => onDone(liked)}>
            Montar meu roteiro
          </Button>
        </div>
      )}
    </div>
  );
}
