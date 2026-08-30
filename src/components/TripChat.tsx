import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, AlertCircle, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { ItineraryView } from "@/components/ItineraryView";
import { LunaLogo } from "@/components/LunaLogo";
import { isItineraryMessage, parseItinerary } from "@/lib/itinerary";
import { supabase } from "@/integrations/supabase/client";
import { updateTripStatus, type MessageRow, type TripRow } from "@/lib/trips.functions";
import { cn } from "@/lib/utils";

type ChatMessage = Pick<MessageRow, "role" | "content"> & {
  id?: string;
  error?: boolean;
  retryOf?: string;
};

// Depois de quanto tempo "pensando" mostramos um aviso extra de paciência.
// Respostas normais chegam bem antes disso; isso só aparece quando a Luna
// está numa rodada de continuação automática (resposta grande, cortada pelo
// limite de tokens do modelo) ou a API está mais lenta que o normal.
const SLOW_RESPONSE_HINT_MS = 8000;

export function TripChat({
  trip,
  initialMessages,
  onMessagesChange,
}: {
  trip: TripRow;
  initialMessages: MessageRow[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const markFinished = useServerFn(updateTripStatus);
  const queryClient = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  useEffect(() => {
    if (!busy) {
      setShowSlowHint(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowHint(true), SLOW_RESPONSE_HINT_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  // Índice da PRIMEIRA mensagem com o roteiro completo. É essa que merece o
  // "reveal" grande (ItineraryView cheio) — qualquer roteiro completo que
  // apareça DEPOIS dela é uma reemissão por causa de uma edição pós-
  // finalização (ver REGRA CRÍTICA #3 do prompt), e mostrar o card gigante
  // de novo a cada pequeno ajuste ("troca só o hotel do Dia 3") é barulho
  // demais. Essas reemissões viram uma confirmação compacta em vez disso —
  // a aba "Viagem" já é atualizada por trás, então nada de informação se
  // perde, só o chat fica mais limpo.
  const firstItineraryIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant" && isItineraryMessage(m.content)),
    [messages],
  );

  const send = useCallback(
    async (message?: string, options?: { skipPush?: boolean }) => {
      setBusy(true);
      if (message && !options?.skipPush) {
        setMessages((prev) => [...prev, { role: "user", content: message }]);
      }
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Sua sessão expirou. Entre novamente.");

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tripId: trip.id, message }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          content?: string;
          truncated?: boolean;
          debug?: { finishReason?: string; usage?: Record<string, number> };
        };

        if (!res.ok || !payload.content) {
          throw new Error(payload.error ?? "A Luna não conseguiu responder agora.");
        }

        const full = payload.content;
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
        if (payload.truncated) {
          const usage = payload.debug?.usage;
          const usageText = usage
            ? ` (tokens: ${usage["completion_tokens"] ?? "?"} de saída, ${usage["prompt_tokens"] ?? "?"} de entrada)`
            : "";
          toast.warning(
            `Resposta pode ter ficado incompleta. Motivo: ${payload.debug?.finishReason ?? "desconhecido"}${usageText}`,
            { duration: 15000 },
          );
        }
        // Recarrega a viagem do banco: sem isso, a aba "Viagem" pode continuar
        // usando os dados carregados antes dessa resposta (por exemplo, se o
        // usuário trocar de aba e voltar, o chat remonta com os dados antigos
        // e "esconde" o roteiro recém-gerado até um refresh manual).
        void queryClient.invalidateQueries({ queryKey: ["trip", trip.id] });
        if (isItineraryMessage(full)) {
          // Chama sempre que a resposta tiver o roteiro completo — mesmo se a
          // viagem já estava "finalizada" antes (edição pós-finalização) —
          // porque também precisamos atualizar itinerary_content com a nova
          // versão, não só o status.
          markFinished({
            data: { tripId: trip.id, status: "finalizada", itineraryContent: full },
          }).catch(() => {
            // silencioso: o roteiro já foi entregue, só o status/link compartilhado ficariam desatualizados
          });
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : "Erro ao falar com a Luna.";
        toast.error(text);
        // Além do toast (que pode passar despercebido), deixa um aviso visível
        // dentro da própria conversa, com a opção de tentar de novo sem
        // precisar redigitar a mensagem original.
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: text, error: true, ...(message ? { retryOf: message } : {}) },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [trip.id, markFinished, queryClient],
  );

  const retry = useCallback(
    (message: string) => {
      void send(message, { skipPush: true });
    },
    [send],
  );

  useEffect(() => {
    if (started.current) return;
    const last = initialMessages[initialMessages.length - 1];
    if (last && last.role === "user") {
      started.current = true;
      void send();
    }
  }, [initialMessages, send]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-1 pb-6">
        {messages.map((message, index) => (
          <Bubble
            key={message.id ?? index}
            role={message.role}
            content={message.content}
            error={message.error}
            retryOf={message.retryOf}
            onRetry={retry}
            isFirstItinerary={index === firstItineraryIndex}
          />
        ))}
        {busy && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LunaLogo size={28} />
              <span className="flex gap-1">
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </span>
            </div>
            {showSlowHint && (
              <p className="ml-9 text-xs text-muted-foreground/80">
                Roteiros grandes podem levar um pouco mais — já estou nisso.
              </p>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/70 bg-background/80 px-1 pt-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (!value || busy) return;
            setDraft("");
            void send(value);
          }}
        >
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const value = draft.trim();
                if (!value || busy) return;
                setDraft("");
                void send(value);
              }
            }}
            placeholder="Escreva para a Luna…"
            rows={2}
            className="min-h-[56px] resize-none rounded-2xl"
          />
          <Button type="submit" size="icon" className="size-11 rounded-2xl" disabled={busy}>
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block size-2 animate-bounce rounded-full bg-primary/60"
      style={{ animationDelay: delay }}
    />
  );
}

export function Bubble({
  role,
  content,
  error,
  retryOf,
  onRetry,
  isFirstItinerary = true,
}: {
  role: "user" | "assistant";
  content: string;
  error?: boolean | undefined;
  retryOf?: string | undefined;
  onRetry?: (message: string) => void;
  isFirstItinerary?: boolean;
}) {
  if (role === "assistant" && isItineraryMessage(content)) {
    if (!isFirstItinerary) {
      return (
        <div className="flex gap-3">
          <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-4" />
          </span>
          <div className="max-w-[85%] rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            Roteiro atualizado com essa mudança — já está refletido na aba{" "}
            <span className="font-semibold">Viagem</span>.
          </div>
        </div>
      );
    }
    return <ItineraryView itinerary={parseItinerary(content)} />;
  }

  if (error) {
    return (
      <div className="flex gap-3">
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-4" />
        </span>
        <div className="max-w-[85%] space-y-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p>{content}</p>
          {retryOf && onRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => onRetry(retryOf)}
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Tentar novamente
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", role === "user" ? "justify-end" : "justify-start")}>
      {role === "assistant" && <LunaLogo size={32} className="mt-1 shrink-0" />}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-card-foreground",
        )}
      >
        {role === "user" ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <Markdown content={content} />
        )}
      </div>
      {role === "user" && (
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Sparkles className="size-4" />
        </span>
      )}
    </div>
  );
}
