import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { INTAKE_QUESTIONS, formatAnswer, type Answers } from "@/lib/intake";

// Atalho pra rever rapidamente o que foi respondido no intake dessa viagem,
// sem precisar rolar até a primeira mensagem do chat (que numa conversa
// longa pode estar bem lá em cima). Mostra só o que a pessoa realmente
// respondeu, na mesma ordem/rótulos do intake.
export function TripProfileDialog({ profile }: { profile: Answers }) {
  const answered = INTAKE_QUESTIONS.filter((q) => profile[q.id] !== undefined);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-xl">
          <ListChecks className="mr-1.5 size-4" /> Ver perfil
        </Button>
      </DialogTrigger>
      <DialogContent className="thin-scrollbar max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil desta viagem</DialogTitle>
          <DialogDescription>O que você respondeu no intake, pra consulta rápida.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          {answered.length === 0 && (
            <p className="text-muted-foreground">Nenhuma resposta registrada.</p>
          )}
          {answered.map((q) => (
            <div key={q.id} className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {q.label}
              </dt>
              <dd>{formatAnswer(profile[q.id])}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
