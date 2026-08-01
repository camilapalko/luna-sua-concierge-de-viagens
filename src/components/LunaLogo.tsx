import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function LunaLogo({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary/10 text-primary",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

export function LunaWordmark({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <LunaLogo size={size} />
      <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Luna
      </span>
    </span>
  );
}
