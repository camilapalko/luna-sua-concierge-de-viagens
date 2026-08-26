import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enableSharing, disableSharing } from "@/lib/sharing.functions";
import type { TripRow } from "@/lib/trips.functions";

// Painel de compartilhamento: gera um link público que mostra SÓ o roteiro
// final (a mesma visão da aba "Viagem"), nunca a conversa com a Luna. O link
// usa um token aleatório e só funciona enquanto o compartilhamento estiver
// ativado — desativar quebra o link na hora, mesmo que alguém já tenha
// guardado a URL.
export function ShareTripPanel({
  trip,
  onChange,
}: {
  trip: Pick<TripRow, "id" | "share_token" | "share_enabled">;
  onChange?: () => void;
}) {
  const doEnable = useServerFn(enableSharing);
  const doDisable = useServerFn(disableSharing);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    trip.share_enabled && trip.share_token
      ? `${window.location.origin}/roteiro/${trip.share_token}`
      : null;

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não consegui copiar. Copie manualmente.");
    }
  }

  async function handleEnable() {
    setBusy(true);
    try {
      const { token } = await doEnable({ data: { tripId: trip.id } });
      onChange?.();
      await copyLink(`${window.location.origin}/roteiro/${token}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui gerar o link.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await doDisable({ data: { tripId: trip.id } });
      onChange?.();
      toast.success("Compartilhamento desativado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui desativar o link.");
    } finally {
      setBusy(false);
    }
  }

  if (!shareUrl) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl"
        disabled={busy}
        onClick={() => void handleEnable()}
      >
        {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Link2 className="mr-1.5 size-4" />}
        Compartilhar roteiro
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input readOnly value={shareUrl} className="h-9 max-w-xs rounded-xl text-xs" />
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={() => void copyLink(shareUrl)}
      >
        {copied ? <Check className="mr-1.5 size-4" /> : <Link2 className="mr-1.5 size-4" />}
        Copiar link
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-xl text-muted-foreground"
        disabled={busy}
        onClick={() => void handleDisable()}
      >
        <X className="mr-1.5 size-4" /> Desativar
      </Button>
    </div>
  );
}
