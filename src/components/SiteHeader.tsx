import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { LunaWordmark } from "@/components/LunaLogo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

        {/* Telas médias/grandes: todos os botões visíveis lado a lado. */}
        <nav className="hidden items-center gap-2 sm:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to="/minhas-viagens">Minhas viagens</Link>
          </Button>
          {user && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/perfil">Meu perfil</Link>
            </Button>
          )}
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

        {/* Celular: com "Minhas viagens" + "Meu perfil" + "Sair" a fila não
            cabe ao lado do logo — em vez de deixar cortar/espremer, agrupa
            tudo num menu. */}
        <div className="sm:hidden">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu">
                  <Menu className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/minhas-viagens">Minhas viagens</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/perfil">Meu perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth" search={{ redirect: pathname }}>
                Entrar
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
