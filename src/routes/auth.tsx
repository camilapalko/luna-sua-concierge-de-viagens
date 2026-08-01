import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LunaWordmark } from "@/components/LunaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar na Luna" },
      {
        name: "description",
        content:
          "Acesse sua conta Luna para salvar viagens e continuar a conversa com a concierge.",
      },
      { property: "og:title", content: "Entrar na Luna" },
      { property: "og:description", content: "Acesse sua conta e continue planejando sua viagem." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : "/chat",
  }),
  component: AuthPage,
});

function safePath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/chat";
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: safePath(redirect), replace: true });
    }
  }, [loading, session, navigate, redirect]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void navigate({ to: safePath(redirect), replace: true });
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}${safePath(redirect)}` },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada! Confirme seu e-mail para continuar.");
      return;
    }
    void navigate({ to: safePath(redirect), replace: true });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: safePath(redirect), replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-luna px-4 py-12">
      <div className="card-luna w-full max-w-md p-8">
        <div className="flex justify-center">
          <LunaWordmark />
        </div>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Entre para salvar sua viagem e continuar conversando com a Luna.
        </p>

        <Button variant="outline" className="mt-6 w-full rounded-xl" onClick={() => void google()}>
          Continuar com Google
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
        </div>

        <Tabs defaultValue="entrar">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="entrar">Entrar</TabsTrigger>
            <TabsTrigger value="criar">Criar conta</TabsTrigger>
          </TabsList>

          <TabsContent value="entrar">
            <form className="mt-5 space-y-4" onSubmit={signIn}>
              <Fields
                email={email}
                password={password}
                setEmail={setEmail}
                setPassword={setPassword}
              />
              <Button type="submit" className="w-full rounded-xl" disabled={busy}>
                Entrar
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="criar">
            <form className="mt-5 space-y-4" onSubmit={signUp}>
              <Fields
                email={email}
                password={password}
                setEmail={setEmail}
                setPassword={setPassword}
              />
              <Button type="submit" className="w-full rounded-xl" disabled={busy}>
                Criar conta
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Fields({
  email,
  password,
  setEmail,
  setPassword,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
      </div>
    </>
  );
}
