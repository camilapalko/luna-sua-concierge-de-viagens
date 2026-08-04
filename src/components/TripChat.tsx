import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, AlertCircle } from "lucide-react";
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

type ChatMessage = Pick<MessageRow, "role" | "content"> & { id?: string; error?: boolean };

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

  const send = useCallback(
    async (message?: string) => {
      setBusy(true);
      if (message) {
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
        };

        if (!res.ok || !payload.content) {
          throw new Error(payload.error ?? "A Luna não conseguiu responder agora.");
        }

        const full = payload.content;
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
        if (payload.truncated) {
          toast.warning("A resposta da Luna pode ter ficado incompleta. Peça para ela continuar.");
        }
        // Recarrega a viagem do banco: sem isso, a aba "Viagem" pode continuar
        // usando os dados carregados antes dessa resposta (por exemplo, se o
        // usuário trocar de aba e voltar, o chat remonta com os dados antigos
        // e "esconde" o roteiro recém-gerado até um refresh manual).
        void queryClient.invalidateQueries({ queryKey: ["trip", trip.id] });
        if (trip.status !== "finalizada" && isItineraryMessage(full)) {
          markFinished({ data: { tripId: trip.id, status: "finalizada" } }).catch(() => {
            // silencioso: o roteiro já foi entregue, só o status ficaria desatualizado
          });
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : "Erro ao falar com a Luna.";
        toast.error(text);
        // Além do toast (que pode passar despercebido), deixa um aviso visível
        // dentro da própria conversa, pra ficar claro que algo falhou — em vez
        // de a conversa simplesmente "não avançar" sem explicação nenhuma.
        setMessages((prev) => [...prev, { role: "assistant", content: text, error: true }]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [trip.id, trip.status, markFinished, queryClient],
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
          />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LunaLogo size={28} />
            <span className="flex gap-1">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </span>
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
}: {
  role: "user" | "assistant";
  content: string;
  error?: boolean | undefined;
}) {
  if (role === "assistant" && isItineraryMessage(content)) {
    return <ItineraryView itinerary={parseItinerary(content)} />;
  }

  if (error) {
    return (
      <div className="flex gap-3">
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-4" />
        </span>
        <div className="max-w-[85%] rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {content}
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
