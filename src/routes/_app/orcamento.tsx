import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { demo } from "@/lib/demo";
import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useFinance, useMutate } from "@/hooks/use-finance";
import { deleteBudget, saveBudget } from "@/lib/finance.functions";
import { PageHeader, Panel, Empty } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { budgetSpent, fmtEUR, fmtMonth, newId, todayLisbon, ym } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/orcamento")({
  head: () => ({ meta: [{ title: "Orçamento — Meu Controle Financeiro" }, { name: "description", content: "Limites de despesa por categoria e mês." }, { property: "og:title", content: "Orçamento mensal" }, { property: "og:description", content: "Limites de despesa por categoria e mês." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Budgets,
});

function Budgets() {
  const d = useFinance();
  const save = useMutate(useServerFn(saveBudget), demo.saveBudget);
  const del = useMutate(useServerFn(deleteBudget), demo.deleteBudget);
  const [month, setMonth] = useState(ym(todayLisbon()));
  const [draft, setDraft] = useState<{ BudgetId?: string; CategoryId: string; BudgetAmount: string; Notes: string; YearMonth: string } | null>(null);
  const [err, setErr] = useState("");
  if (!d) return null;

  const months = Array.from(new Set([ym(todayLisbon()), ...d.budgets.map((b) => b.YearMonth)])).sort().reverse();
  const list = d.budgets.filter((b) => b.YearMonth === month);
  const expCats = d.categories.filter((c) => c.Type === "Despesa");
  const name = (id: string) => d.categories.find((c) => c.CategoryId === id)?.Name ?? "—";

  async function submit() {
    if (!draft) return;
    const amount = Number(draft.BudgetAmount.replace(",", "."));
    if (!draft.CategoryId) return setErr("Escolha uma categoria.");
    if (!(amount > 0)) return setErr("O limite deve ser superior a zero.");
    if (!draft.BudgetId && d!.budgets.some((b) => b.YearMonth === draft.YearMonth && b.CategoryId === draft.CategoryId)) return setErr("Já existe orçamento para esta categoria neste mês.");
    setErr("");
    const ok = await save.run({ BudgetId: draft.BudgetId ?? newId("bud"), YearMonth: draft.YearMonth, CategoryId: draft.CategoryId, BudgetAmount: amount, Notes: draft.Notes }, "Orçamento guardado no Google Sheets");
    if (ok) setDraft(null);
  }

  return (
    <>
      <PageHeader title="Orçamento mensal" subtitle={fmtMonth(month)} actions={<>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44 bg-card" />
        <Button onClick={() => setDraft({ CategoryId: "", BudgetAmount: "", Notes: "", YearMonth: month })}><Plus className="h-4 w-4" />Novo limite</Button>
      </>} />
      {list.length === 0 ? <Empty>Sem orçamentos definidos para {fmtMonth(month)}.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((b) => {
            const spent = budgetSpent(b, d.transactions);
            const pct = spent / b.BudgetAmount;
            const tone = pct >= 1 ? "bg-expense" : pct >= 0.8 ? "bg-warning" : "bg-income";
            return (
              <Panel key={b.BudgetId}>
                <div className="flex items-start justify-between">
                  <div><h3 className="font-semibold">{name(b.CategoryId)}</h3>{b.Notes && <p className="text-xs text-muted-foreground">{b.Notes}</p>}</div>
                  <div className="flex">
                    <Button size="icon" variant="ghost" onClick={() => setDraft({ ...b, BudgetAmount: String(b.BudgetAmount) })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" disabled={del.pending} onClick={() => confirm("Eliminar este orçamento?") && del.run({ BudgetId: b.BudgetId }, "Orçamento eliminado")} aria-label="Eliminar"><Trash2 className="h-4 w-4 text-expense" /></Button>
                  </div>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
                <div className="tabular mt-3 grid grid-cols-4 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Orçado</p><p className="font-semibold">{fmtEUR(b.BudgetAmount)}</p></div>
                  <div><p className="text-muted-foreground">Gasto</p><p className="font-semibold">{fmtEUR(spent)}</p></div>
                  <div><p className="text-muted-foreground">Restante</p><p className={cn("font-semibold", spent > b.BudgetAmount && "text-expense")}>{fmtEUR(b.BudgetAmount - spent)}</p></div>
                  <div><p className="text-muted-foreground">Consumido</p><p className={cn("font-semibold", pct >= 1 ? "text-expense" : pct >= 0.8 && "text-warning")}>{(pct * 100).toFixed(0)}%</p></div>
                </div>
                {pct >= 1 ? <p className="mt-3 text-xs font-medium text-expense">Orçamento ultrapassado.</p> : pct >= 0.8 && <p className="mt-3 text-xs font-medium text-warning">Atingiu 80% do orçamento.</p>}
              </Panel>
            );
          })}
        </div>
      )}
      {months.length > 1 && <Panel title="Histórico" className="mt-6"><div className="flex flex-wrap gap-2">{months.map((m) => <Button key={m} size="sm" variant={m === month ? "default" : "outline"} onClick={() => setMonth(m)}>{fmtMonth(m)}</Button>)}</div></Panel>}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent><DialogHeader><DialogTitle>{draft?.BudgetId ? "Editar limite" : "Novo limite"}</DialogTitle></DialogHeader>
          {draft && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Mês</Label><Input type="month" value={draft.YearMonth} onChange={(e) => setDraft({ ...draft, YearMonth: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Limite (€)</Label><Input inputMode="decimal" value={draft.BudgetAmount} onChange={(e) => setDraft({ ...draft, BudgetAmount: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Categoria</Label><Select value={draft.CategoryId} onValueChange={(v) => setDraft({ ...draft, CategoryId: v })}><SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger><SelectContent>{expCats.map((c) => <SelectItem key={c.CategoryId} value={c.CategoryId}>{c.Name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Observações</Label><Input value={draft.Notes} onChange={(e) => setDraft({ ...draft, Notes: e.target.value })} maxLength={500} /></div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>}
          <DialogFooter><Button onClick={submit} disabled={save.pending}>{save.pending ? "A gravar…" : "Guardar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
