import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  LayoutDashboard, ArrowLeftRight, PlusCircle, Tags, Landmark, PiggyBank, BarChart3, Settings, LogOut, Wallet, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFinanceQuery } from "@/hooks/use-finance";
import { SetupPanel } from "@/components/app/SetupPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    if (localStorage.getItem("mcf-ephemeral") && !sessionStorage.getItem("mcf-alive")) {
      await supabase.auth.signOut();
      localStorage.removeItem("mcf-ephemeral");
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
  { to: "/nova", label: "Nova movimentação", icon: PlusCircle },
  { to: "/categorias", label: "Categorias", icon: Tags },
  { to: "/contas", label: "Contas", icon: Landmark },
  { to: "/orcamento", label: "Orçamento", icon: PiggyBank },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function AppLayout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const q = useFinanceQuery();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_OUT") { qc.clear(); nav({ to: "/login" }); }
    });
    return () => data.subscription.unsubscribe();
  }, [nav, qc]);

  let body: React.ReactNode;
  if (q.isLoading) body = <div className="flex h-64 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />A carregar dados do Google Sheets…</div>;
  else if (q.isError) body = <SetupPanel error="Não foi possível contactar o servidor. Verifique a ligação e tente novamente." />;
  else if (q.data && !q.data.ok) body = <SetupPanel error={q.data.error} code={q.data.code} />;
  else body = <Outlet />;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Wallet className="h-5 w-5" /></div>
          <span className="font-display text-sm font-semibold leading-tight text-sidebar-accent-foreground">Meu Controle<br />Financeiro</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", path.startsWith(n.to) && "bg-sidebar-accent text-sidebar-accent-foreground font-medium")}>
              <n.icon className="h-4 w-4" />{n.label}
            </Link>
          ))}
        </nav>
        <button onClick={() => supabase.auth.signOut()} className="m-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-sidebar-accent"><LogOut className="h-4 w-4" />Terminar sessão</button>
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
        <span className="flex items-center gap-2 font-display text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" />Meu Controle Financeiro</span>
        <button onClick={() => supabase.auth.signOut()} aria-label="Terminar sessão"><LogOut className="h-4 w-4 text-muted-foreground" /></button>
      </header>
      <main className="px-4 pb-28 pt-6 lg:ml-64 lg:px-10 lg:pb-10 lg:pt-10">{body}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t bg-card lg:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={cn("flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 px-2 py-2 text-[10px] text-muted-foreground", path.startsWith(n.to) && "text-primary")}>
            <n.icon className="h-5 w-5" /><span className="truncate">{n.label.split(" ")[0]}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
