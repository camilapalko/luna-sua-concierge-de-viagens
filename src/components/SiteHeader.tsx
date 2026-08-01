import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LunaWordmark } from "@/components/LunaLogo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function SiteHeader() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" aria-label="Luna - início">
          <LunaWordmark size={34} />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/minhas-viagens">Minhas viagens</Link>
          </Button>
          {user ? (
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sair
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth" search={{ redirect: pathname }}>
                Entrar
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
