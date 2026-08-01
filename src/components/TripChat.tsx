import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, Plane, BedDouble, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/Markdown";
import { ItineraryView } from "@/components/ItineraryView";
import { LunaLogo } from "@/components/LunaLogo";
import { isItineraryMessage, parseItinerary } from "@/lib/itinerary";
import { supabase } from "@/integrations/supabase/client";
import { searchFlights, searchStays } from "@/lib/travel.functions";
import type { MessageRow, TripRow } from "@/lib/trips.functions";
import { cn } from "@/lib/utils";

type ChatMessage = Pick<MessageRow, "role" | "content"> & { id?: string };

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
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<string | null>(null);
  const [toolBusy, setToolBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  const send = useCallback(
    async (message?: string) => {
      setBusy(true);
      setStreaming("");
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

        if (!res.ok || !res.body) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "A Luna não conseguiu responder agora.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setStreaming(full);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
        setStreaming("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao falar com a Luna.");
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [trip.id],
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

  async function runTool(kind: "flights" | "stays") {
    setToolBusy(true);
    setTools(null);
    try {
      const profile = trip.profile as Record<string, string | string[]>;
      if (kind === "flights") {
        const result = await searchFlights({
          data: {
            origin: String(profile["origin"] ?? trip.origin ?? "São Paulo"),
            destination: trip.destination,
            dates: String(profile["dates"] ?? ""),
            preferences: [profile["flight_time_pref"], profile["airline_pref"], profile["connections_pref"]]
              .filter(Boolean)
              .join(", "),
          },
        });
        const body = [
          "### ✈️ Opções de voo encontradas",
          ...result.options.map(
            (o) =>
              `- **${o.airline}** · ${o.departure} → ${o.arrival} · ${o.duration} · ${o.stops} · ${o.price}`,
          ),
          "",
          `[Google Flights](${result.links.googleFlights}) · [Kayak](${result.links.kayak}) · [Skyscanner](${result.links.skyscanner})`,
        ].join("\n");
        setTools(body);
      } else {
        const result = await searchStays({
          data: {
            destination: trip.destination,
            dates: String(profile["dates"] ?? ""),
            style: String(profile["budget"] ?? ""),
            travelers: String(profile["travelers"] ?? ""),
          },
        });
        const body = [
          "### 🏨 Opções de hospedagem",
          ...result.options.map(
            (o) =>
              `- **${o.name}** (${o.type}) · ${o.location} · ${o.pricePerNight} · ${o.amenities.join(", ")}`,
          ),
          "",
          `[Buscar no Booking.com](${result.links.booking})`,
        ].join("\n");
        setTools(body);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui buscar agora.");
    } finally {
      setToolBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-1 pb-6">
        {messages.map((message, index) => (
          <Bubble key={message.id ?? index} role={message.role} content={message.content} />
        ))}
        {streaming && <Bubble role="assistant" content={streaming} />}
        {busy && !streaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LunaLogo size={28} />
            <span className="flex gap-1">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </span>
          </div>
        )}
        {tools && (
          <div className="card-luna p-4">
            <Markdown content={tools} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/70 bg-background/80 px-1 pt-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={toolBusy}
            onClick={() => void runTool("flights")}
          >
            {toolBusy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Plane className="mr-1 size-3.5" />}
            Buscar voos
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={toolBusy}
            onClick={() => void runTool("stays")}
          >
            {toolBusy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <BedDouble className="mr-1 size-3.5" />}
            Buscar hospedagem
          </Button>
        </div>
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

export function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "assistant" && isItineraryMessage(content)) {
    return <ItineraryView itinerary={parseItinerary(content)} />;
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
