import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { demo, isDemo } from "@/lib/demo";
import { ReceiptField } from "@/components/app/ReceiptField";
import { useEffect, useMemo, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fmtDate, fmtEUR } from "@/lib/finance";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useFinance, useMutate } from "@/hooks/use-finance";
import { saveTransaction, saveTransfer } from "@/lib/finance.functions";
import { PageHeader, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { paymentMethods, RECURRENCES, type Transaction } from "@/lib/schema";
import { newId, todayLisbon } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/nova")({
  validateSearch: z.object({ id: z.string().optional() }),
  head: () => ({ meta: [{ title: "Nova movimentação — Meu Controle Financeiro" }, { name: "description", content: "Registar uma receita, despesa ou transferência." }, { property: "og:title", content: "Nova movimentação" }, { property: "og:description", content: "Registar uma receita, despesa ou transferência." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewTx,
});

type Kind = "Receita" | "Despesa" | "Transferência";

function Field({ label, error, children, className }: { label: string; error?: string | undefined; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}

/** Text date field in DD/MM/AAAA; emits ISO (AAAA-MM-DD) or "" while incomplete/invalid. */
function DateInput({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const toText = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
  const [text, setText] = useState(() => toText(value));
  // Sync when the value is set from outside (e.g. AI reading a receipt).
  useEffect(() => { if (value && toText(value) !== text) setText(toText(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  function change(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const t = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
    setText(t);
    if (digits.length === 8) {
      const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
      const dt = new Date(`${iso}T00:00:00Z`);
      onChange(!isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : "");
    } else onChange("");
  }
  return <Input inputMode="numeric" placeholder="DD/MM/AAAA" value={text} onChange={(e) => change(e.target.value)} maxLength={10} />;
}

function NewTx() {
  const d = useFinance();
  const { id } = Route.useSearch();
  const editing = d?.transactions.find((t) => t.TransactionId === id && t.Type !== "Transferência");
  if (!d) return null;
  if (id && !editing) return <p className="text-sm text-muted-foreground">Movimentação não encontrada.</p>;
  return <TxForm key={id ?? "new"} editing={editing} />;
}

function TxForm({ editing }: { editing: Transaction | undefined }) {
  const d = useFinance()!;
  const nav = useNavigate();
  const tx = useMutate(useServerFn(saveTransaction), demo.saveTransaction);
  const tr = useMutate(useServerFn(saveTransfer), demo.saveTransfer);
  const [kind, setKind] = useState<Kind>(editing?.Type ?? "Despesa");
  // Stable ID per form: resubmitting after a failure updates the same record instead of duplicating it.
  const [txId] = useState(() => editing?.TransactionId ?? newId("tx"));
  const [groupId] = useState(() => newId("tr"));
  const [f, setF] = useState({
    Description: editing?.Description ?? "", Amount: editing ? String(editing.Amount).replace(".", ",") : "",
    TransactionDate: editing?.TransactionDate ?? todayLisbon(), DueDate: editing?.DueDate ?? "",
    CategoryId: editing?.CategoryId ?? "", SubcategoryId: editing?.SubcategoryId ?? "", AccountId: editing?.AccountId ?? "",
    ToAccountId: "", PaymentMethod: editing?.PaymentMethod ?? "", Status: (editing?.Status ?? "Pago") as string,
    Nature: editing?.Nature ?? "Variável", Recurrence: editing?.Recurrence ?? "Não recorrente", Notes: editing?.Notes ?? "",
    Attachment: editing?.Attachment ?? "",
  });
  type ErrKey = "Description" | "Amount" | "TransactionDate" | "AccountId" | "ToAccountId" | "CategoryId";
  const [errors, setErrors] = useState<Partial<Record<ErrKey, string>>>({});
  const [confirm, setConfirm] = useState<number | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v, ...(k === "CategoryId" ? { SubcategoryId: "" } : {}) }));

  const cats = useMemo(() => d.categories.filter((c) => c.Type === kind && (c.Active || c.CategoryId === f.CategoryId)).sort((a, b) => a.Name.localeCompare(b.Name)), [d, kind, f.CategoryId]);
  const subs = d.subcategories.filter((s) => s.CategoryId === f.CategoryId && (s.Active || s.SubcategoryId === f.SubcategoryId));
  const accounts = d.accounts.filter((a) => a.Active || a.AccountId === f.AccountId);
  const statuses = kind === "Receita" ? ["Recebido", "Pendente", "Cancelado"] : kind === "Despesa" ? ["Pago", "Pendente", "Cancelado"] : ["Efetuada", "Pendente", "Cancelado"];
  const pending = tx.pending || tr.pending;

  function changeKind(k: Kind) {
    setKind(k);
    setF((p) => ({ ...p, CategoryId: "", SubcategoryId: "", Status: k === "Receita" ? "Recebido" : k === "Despesa" ? "Pago" : "Efetuada" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(f.Amount.replace(/\s/g, "").replace(",", "."));
    const err: Partial<Record<ErrKey, string>> = {};
    if (!f.Description.trim()) err.Description = "Indique uma descrição.";
    if (!Number.isFinite(amount) || amount <= 0) err.Amount = "O valor deve ser superior a zero.";
    if (!f.TransactionDate) err.TransactionDate = "Indique a data.";
    if (!f.AccountId) err.AccountId = "Escolha uma conta.";
    if (kind === "Transferência") {
      if (!f.ToAccountId) err.ToAccountId = "Escolha a conta de destino.";
      else if (f.ToAccountId === f.AccountId) err.ToAccountId = "A conta de destino deve ser diferente.";
    } else if (!f.CategoryId) err.CategoryId = "Escolha uma categoria.";
    setErrors(err);
    if (Object.keys(err).length) return;
    setConfirm(amount);
  }

  async function save(amount: number) {
    setConfirm(null);
    const ok = kind === "Transferência"
      ? await tr.run({ TransferGroupId: groupId, FromAccountId: f.AccountId, ToAccountId: f.ToAccountId, Amount: amount, TransactionDate: f.TransactionDate, Description: f.Description, Status: f.Status as "Efetuada", Notes: f.Notes }, "Transferência registada no Google Sheets")
      : await tx.run({
          TransactionId: txId, Type: kind, Description: f.Description, Amount: amount, TransactionDate: f.TransactionDate, DueDate: f.DueDate,
          CategoryId: f.CategoryId, SubcategoryId: f.SubcategoryId, AccountId: f.AccountId, PaymentMethod: f.PaymentMethod,
          Status: f.Status as Transaction["Status"], Nature: f.Nature as "Fixa", Recurrence: f.Recurrence as "Mensal", Notes: f.Notes,
          Attachment: kind === "Despesa" ? f.Attachment : "",
          expectedUpdatedAt: editing?.UpdatedAt,
        }, editing ? "Movimentação atualizada no Google Sheets" : "Movimentação gravada no Google Sheets");
    if (ok) nav({ to: "/movimentacoes" });
  }

  return (
    <>
      <PageHeader title={editing ? "Editar movimentação" : "Nova movimentação"} subtitle={editing ? `ID ${editing.TransactionId}` : "Os dados são gravados diretamente no Google Sheets."} />
      <form onSubmit={submit} className="max-w-3xl">
        <Panel>
          {!editing && (
            <div className="mb-6 inline-flex rounded-xl bg-muted p-1">
              {(["Despesa", "Receita", "Transferência"] as Kind[]).map((k) => (
                <button type="button" key={k} onClick={() => changeKind(k)} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium text-muted-foreground transition", kind === k && "bg-card shadow-card", kind === k && (k === "Receita" ? "text-income" : k === "Despesa" ? "text-expense" : "text-primary"))}>{k}</button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === "Despesa" && <Field label="Foto da despesa" className="sm:col-span-2"><ReceiptField value={f.Attachment} onChange={set("Attachment")} txId={txId} disabled={isDemo()}
              cats={d.categories.filter((c) => c.Type === "Despesa" && c.Active).map((c) => ({ id: c.CategoryId, name: c.Name }))}
              subs={d.subcategories.filter((s) => s.Active).map((s) => ({ id: s.SubcategoryId, name: s.Name, categoryId: s.CategoryId }))}
              onRead={(r) => setF((p) => ({ ...p, Description: r.description || p.Description, Amount: String(r.amount).replace(".", ","), TransactionDate: r.date || p.TransactionDate, CategoryId: r.categoryId || p.CategoryId, SubcategoryId: r.categoryId ? r.subcategoryId : p.SubcategoryId }))} /></Field>}
            <Field label="Descrição *" error={errors.Description} className="sm:col-span-2"><Input value={f.Description} onChange={(e) => set("Description")(e.target.value)} maxLength={200} /></Field>
            <Field label="Valor (€) *" error={errors.Amount}><Input inputMode="decimal" placeholder="0,00" value={f.Amount} onChange={(e) => set("Amount")(e.target.value)} /></Field>
            <Field label="Data *" error={errors.TransactionDate}><DateInput value={f.TransactionDate} onChange={set("TransactionDate")} /></Field>
            {kind !== "Transferência" && (
              <>
                <Field label="Data de vencimento"><DateInput value={f.DueDate} onChange={set("DueDate")} /></Field>
                <Field label="Status"><Select value={f.Status} onValueChange={set("Status")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Categoria *" error={errors.CategoryId}>
                  <Select value={f.CategoryId} onValueChange={set("CategoryId")}><SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger><SelectContent>{cats.map((c) => <SelectItem key={c.CategoryId} value={c.CategoryId}>{c.Name}</SelectItem>)}</SelectContent></Select>
                </Field>
                <Field label="Subcategoria">
                  <Select value={f.SubcategoryId} onValueChange={set("SubcategoryId")} disabled={!subs.length}><SelectTrigger><SelectValue placeholder={f.CategoryId ? (subs.length ? "Escolher" : "Sem subcategorias") : "Escolha a categoria"} /></SelectTrigger><SelectContent>{subs.map((s) => <SelectItem key={s.SubcategoryId} value={s.SubcategoryId}>{s.Name}</SelectItem>)}</SelectContent></Select>
                </Field>
              </>
            )}
            <Field label={kind === "Transferência" ? "Conta de origem *" : "Conta *"} error={errors.AccountId}>
              <Select value={f.AccountId} onValueChange={set("AccountId")}><SelectTrigger><SelectValue placeholder={accounts.length ? "Escolher" : "Crie primeiro uma conta"} /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.AccountId} value={a.AccountId}>{a.Name}</SelectItem>)}</SelectContent></Select>
            </Field>
            {kind === "Transferência" ? (
              <>
                <Field label="Conta de destino *" error={errors.ToAccountId}>
                  <Select value={f.ToAccountId} onValueChange={set("ToAccountId")}><SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.AccountId} value={a.AccountId}>{a.Name}</SelectItem>)}</SelectContent></Select>
                </Field>
                <Field label="Status"><Select value={f.Status} onValueChange={set("Status")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
              </>
            ) : (
              <>
                <Field label={kind === "Receita" ? "Método de recebimento" : "Método de pagamento"}><Select value={f.PaymentMethod} onValueChange={set("PaymentMethod")}><SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger><SelectContent>{[...new Set([...paymentMethods(d.settings), ...(f.PaymentMethod ? [f.PaymentMethod] : [])])].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Recorrência"><Select value={f.Recurrence} onValueChange={set("Recurrence")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECURRENCES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></Field>
              </>
            )}
            <Field label="Observações" className="sm:col-span-2"><Textarea value={f.Notes} onChange={(e) => set("Notes")(e.target.value)} maxLength={1000} /></Field>
          </div>
          <div className="mt-6 flex gap-2">
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "A gravar…" : "Guardar"}</Button>
            <Button type="button" variant="outline" onClick={() => nav({ to: "/movimentacoes" })}>Cancelar</Button>
          </div>
        </Panel>
      </form>
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar gravação?</AlertDialogTitle>
            <AlertDialogDescription>
              {kind}: {f.Description} — {fmtEUR(confirm ?? 0)} em {f.TransactionDate ? fmtDate(f.TransactionDate) : ""}
              {kind !== "Transferência" && <> · {d.categories.find((c) => c.CategoryId === f.CategoryId)?.Name ?? ""}</>}
              {" "}· {d.accounts.find((a) => a.AccountId === f.AccountId)?.Name ?? ""} · {f.Status}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Rever</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm !== null && save(confirm)}>Confirmar e guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
