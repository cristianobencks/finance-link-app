import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { demo } from "@/lib/demo";
import { useState } from "react";
import { Landmark, Pencil, Plus } from "lucide-react";
import { useFinance, useMutate } from "@/hooks/use-finance";
import { saveAccount } from "@/lib/finance.functions";
import { PageHeader, Panel, Empty } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { accountBalance, fmtDate, fmtEUR, newId, todayLisbon } from "@/lib/finance";
import { ACCOUNT_TYPES, type Account } from "@/lib/schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/contas")({
  head: () => ({ meta: [{ title: "Contas — Meu Controle Financeiro" }, { name: "description", content: "Gerir contas financeiras e saldos." }, { property: "og:title", content: "Contas" }, { property: "og:description", content: "Gerir contas financeiras e saldos." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Accounts,
});

type Draft = Partial<Omit<Account, "OpeningBalance">> & { OpeningBalance: string };

function Accounts() {
  const d = useFinance();
  const save = useMutate(useServerFn(saveAccount), demo.saveAccount);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  if (!d) return null;

  async function submit() {
    if (!draft) return;
    const bal = Number(draft.OpeningBalance.replace(/\s/g, "").replace(",", "."));
    if (!draft.Name?.trim()) return setErr("Indique o nome da conta.");
    if (!Number.isFinite(bal)) return setErr("Saldo inicial inválido.");
    setErr("");
    const ok = await save.run({
      AccountId: draft.AccountId ?? newId("acc"), Name: draft.Name, AccountType: (draft.AccountType ?? "Conta bancária") as "Outra",
      Institution: draft.Institution ?? "", OpeningBalance: bal, OpeningDate: draft.OpeningDate || todayLisbon(), Currency: "EUR", Active: draft.Active ?? true,
    }, "Conta guardada no Google Sheets");
    if (ok) setDraft(null);
  }

  return (
    <>
      <PageHeader title="Contas financeiras" subtitle="Saldo = saldo inicial + movimentações liquidadas." actions={<Button onClick={() => setDraft({ OpeningBalance: "0", AccountType: "Conta bancária", Active: true, OpeningDate: todayLisbon() })}><Plus className="h-4 w-4" />Nova conta</Button>} />
      {d.accounts.length === 0 ? <Empty>Ainda não tem contas.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {d.accounts.map((a) => {
            const bal = accountBalance(a, d.transactions);
            return (
              <Panel key={a.AccountId} className={cn(!a.Active && "opacity-60")}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Landmark className="h-5 w-5" /></div><div><h3 className="font-semibold">{a.Name}</h3><p className="text-xs text-muted-foreground">{a.AccountType}{a.Institution && ` · ${a.Institution}`}{!a.Active && " · inativa"}</p></div></div>
                  <Button size="icon" variant="ghost" onClick={() => setDraft({ ...a, OpeningBalance: String(a.OpeningBalance).replace(".", ",") })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                </div>
                <div className={cn("tabular mt-4 font-display text-2xl font-semibold", bal < 0 && "text-expense")}>{fmtEUR(bal)}</div>
                <p className="mt-1 text-xs text-muted-foreground">Saldo inicial {fmtEUR(a.OpeningBalance)} em {fmtDate(a.OpeningDate)}</p>
              </Panel>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">Por segurança, não guarde números de cartão, códigos ou palavras-passe bancárias.</p>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent><DialogHeader><DialogTitle>{draft?.AccountId ? "Editar conta" : "Nova conta"}</DialogTitle></DialogHeader>
          {draft && <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={draft.Name ?? ""} onChange={(e) => setDraft({ ...draft, Name: e.target.value })} maxLength={60} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Tipo</Label><Select value={draft.AccountType ?? "Conta bancária"} onValueChange={(v) => setDraft({ ...draft, AccountType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Instituição (opcional)</Label><Input value={draft.Institution ?? ""} onChange={(e) => setDraft({ ...draft, Institution: e.target.value })} maxLength={60} /></div>
              <div className="space-y-1.5"><Label>Saldo inicial (€)</Label><Input inputMode="decimal" value={draft.OpeningBalance} onChange={(e) => setDraft({ ...draft, OpeningBalance: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Data do saldo inicial</Label><Input type="date" value={draft.OpeningDate ?? ""} onChange={(e) => setDraft({ ...draft, OpeningDate: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={draft.Active ?? true} onCheckedChange={(v) => setDraft({ ...draft, Active: v })} /><Label>Ativa</Label></div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>}
          <DialogFooter><Button onClick={submit} disabled={save.pending}>{save.pending ? "A gravar…" : "Guardar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
