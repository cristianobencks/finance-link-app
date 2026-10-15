import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useFinanceQuery } from "@/hooks/use-finance";
import { PageHeader, Panel } from "@/components/app/ui";
import { SetupPanel } from "@/components/app/SetupPanel";
import { Button } from "@/components/ui/button";
import { SHEETS } from "@/lib/schema";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { getAllowedEmails, saveAllowedEmails } from "@/lib/finance.functions";

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Meu Controle Financeiro" }, { name: "description", content: "Ligação ao Google Sheets e estrutura da folha de cálculo." }, { property: "og:title", content: "Configurações" }, { property: "og:description", content: "Ligação ao Google Sheets e estrutura da folha." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
        {d?.isOwner && <AccessPanel />}
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

function AccessPanel() {
  const load = useServerFn(getAllowedEmails);
  const save = useServerFn(saveAllowedEmails);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    load().then((r) => r.ok && setText(r.data.join("\n")));
  }, [load]);
  async function onSave() {
    const emails = text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    setBusy(true);
    try {
      const r = await save({ data: { emails } });
      if (r.ok) toast.success("Lista de acessos guardada.");
      else toast.error(r.error);
    } catch {
      toast.error("Há emails inválidos na lista. Nada foi guardado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Utilizadores autorizados" className="xl:col-span-2">
      <p className="text-sm text-muted-foreground">Um email por linha. Cada pessoa autorizada recebe a sua própria folha de cálculo, separada da sua, criada na primeira entrada. Os restantes são bloqueados.</p>
      <Textarea className="mt-3 min-h-28 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="pessoa@gmail.com" />
      <Button className="mt-3" onClick={onSave} disabled={busy}>{busy ? "A guardar…" : "Guardar acessos"}</Button>
    </Panel>
  );
}
