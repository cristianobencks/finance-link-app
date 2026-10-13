import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useFinanceQuery } from "@/hooks/use-finance";
import { PageHeader, Panel } from "@/components/app/ui";
import { SetupPanel } from "@/components/app/SetupPanel";
import { Button } from "@/components/ui/button";
import { SHEETS } from "@/lib/schema";

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Meu Controle Financeiro" }, { name: "description", content: "Ligação ao Google Sheets e estrutura da folha de cálculo." }, { property: "og:title", content: "Configurações" }, { property: "og:description", content: "Ligação ao Google Sheets e estrutura da folha." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const q = useFinanceQuery();
  const d = q.data?.ok ? q.data.data : null;
  return (
    <>
      <PageHeader title="Configurações" subtitle="Formato regional: Português (Portugal) · EUR (€) · DD/MM/AAAA · Europe/Lisbon" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Google Sheets">
          <p className="text-sm text-muted-foreground">Estado: <span className="font-medium text-income">Ligado</span> · {d?.transactions.length ?? 0} movimentações, {d?.categories.length ?? 0} categorias, {d?.accounts.length ?? 0} contas.</p>
          {d && d.spreadsheetUrl && <Button asChild variant="outline" className="mt-4"><a href={d.spreadsheetUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir folha de cálculo</a></Button>}
        </Panel>
        <SetupPanel />
        <Panel title="Estrutura esperada" className="xl:col-span-2">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(SHEETS).map(([tab, cols]) => (
              <div key={tab} className="rounded-xl bg-muted p-3"><p className="text-sm font-semibold">{tab}</p><p className="mt-1 break-words font-mono text-xs text-muted-foreground">{cols.join(", ")}</p></div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
