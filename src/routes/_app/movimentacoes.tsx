import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { demo } from "@/lib/demo";
import { useMemo, useState } from "react";
import { ArrowDownUp, Download, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { useFinance, useMutate } from "@/hooks/use-finance";
import { deleteTransaction } from "@/lib/finance.functions";
import { PageHeader, Panel, Empty, StatusBadge, Amount } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadCSV, fmtDate, fmtDateTime, fmtEUR } from "@/lib/finance";
import { TX_STATUS, TX_TYPES, type Transaction } from "@/lib/schema";

export const Route = createFileRoute("/_app/movimentacoes")({
  head: () => ({ meta: [{ title: "Movimentações — Meu Controle Financeiro" }, { name: "description", content: "Lista, filtros e exportação das movimentações." }, { property: "og:title", content: "Movimentações" }, { property: "og:description", content: "Lista, filtros e exportação das movimentações." }] }),
  component: List,
});

const PAGE = 15;

function List() {
  const d = useFinance();
  const del = useMutate(useServerFn(deleteTransaction), demo.deleteTransaction);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [sub, setSub] = useState("all");
  const [sort, setSort] = useState<{ k: "date" | "amount"; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<Transaction | null>(null);
  const [view, setView] = useState<Transaction | null>(null);

  const rows = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    return d.transactions
      .filter((t) => (!s || t.Description.toLowerCase().includes(s) || t.Notes.toLowerCase().includes(s))
        && (!from || t.TransactionDate >= from) && (!to || t.TransactionDate <= to)
        && (type === "all" || t.Type === type) && (status === "all" || t.Status === status)
        && (account === "all" || t.AccountId === account) && (category === "all" || t.CategoryId === category)
        && (sub === "all" || t.SubcategoryId === sub))
      .sort((a, b) => sort.dir * (sort.k === "date" ? a.TransactionDate.localeCompare(b.TransactionDate) || a.CreatedAt.localeCompare(b.CreatedAt) : a.Amount - b.Amount));
  }, [d, q, from, to, type, status, account, category, sub, sort]);
  if (!d) return null;

  const catName = (id: string) => d.categories.find((c) => c.CategoryId === id)?.Name ?? "—";
  const subName = (id: string) => d.subcategories.find((c) => c.SubcategoryId === id)?.Name ?? "—";
  const accName = (id: string) => d.accounts.find((a) => a.AccountId === id)?.Name ?? "—";
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(0); };
  const toggleSort = (k: "date" | "amount") => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }));

  function exportCSV() {
    downloadCSV("movimentacoes.csv", [
      ["ID", "Data", "Descrição", "Tipo", "Categoria", "Subcategoria", "Conta", "Valor", "Estado", "Vencimento", "Natureza", "Observações"],
      ...rows.map((t) => [t.TransactionId, fmtDate(t.TransactionDate), t.Description, t.Type, catName(t.CategoryId), subName(t.SubcategoryId), accName(t.AccountId), t.Amount.toFixed(2).replace(".", ","), t.Status, fmtDate(t.DueDate), t.Nature, t.Notes]),
    ]);
  }

  return (
    <>
      <PageHeader title="Movimentações" subtitle={`${rows.length} registo(s)`} actions={<><Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4" />CSV</Button><Button asChild><Link to="/nova"><Plus className="h-4 w-4" />Adicionar</Link></Button></>} />
      <Panel className="mb-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Pesquisar…" value={q} onChange={(e) => reset(setQ)(e.target.value)} className="lg:col-span-2" />
          <Input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="Desde" />
          <Input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="Até" />
          <Select value={type} onValueChange={reset(setType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{TX_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={reset(setStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os estados</SelectItem>{TX_STATUS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          <Select value={account} onValueChange={reset(setAccount)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as contas</SelectItem>{d.accounts.map((a) => <SelectItem key={a.AccountId} value={a.AccountId}>{a.Name}</SelectItem>)}</SelectContent></Select>
          <Select value={category} onValueChange={(v) => { reset(setCategory)(v); setSub("all"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{d.categories.map((c) => <SelectItem key={c.CategoryId} value={c.CategoryId}>{c.Name} ({c.Type})</SelectItem>)}</SelectContent></Select>
          {category !== "all" && <Select value={sub} onValueChange={reset(setSub)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as subcategorias</SelectItem>{d.subcategories.filter((s) => s.CategoryId === category).map((s) => <SelectItem key={s.SubcategoryId} value={s.SubcategoryId}>{s.Name}</SelectItem>)}</SelectContent></Select>}
        </div>
      </Panel>
      <Panel className="p-0">
        {shown.length === 0 ? <div className="p-5"><Empty>Nenhuma movimentação encontrada.</Empty></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead><button className="inline-flex items-center gap-1" onClick={() => toggleSort("date")}>Data<ArrowDownUp className="h-3 w-3" /></button></TableHead>
              <TableHead>Descrição</TableHead><TableHead className="hidden md:table-cell">Tipo</TableHead><TableHead className="hidden lg:table-cell">Categoria</TableHead><TableHead className="hidden xl:table-cell">Subcategoria</TableHead><TableHead className="hidden md:table-cell">Conta</TableHead>
              <TableHead className="text-right"><button className="inline-flex items-center gap-1" onClick={() => toggleSort("amount")}>Valor<ArrowDownUp className="h-3 w-3" /></button></TableHead>
              <TableHead>Estado</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>{shown.map((t) => (
              <TableRow key={t.TransactionId}>
                <TableCell className="whitespace-nowrap tabular">{fmtDate(t.TransactionDate)}</TableCell>
                <TableCell className="max-w-[16rem] truncate font-medium">{t.Description}</TableCell>
                <TableCell className="hidden md:table-cell">{t.Type}{t.Type === "Transferência" && <span className="text-xs text-muted-foreground"> ({t.TransactionId.endsWith("-out") ? "saída" : "entrada"})</span>}</TableCell>
                <TableCell className="hidden lg:table-cell">{catName(t.CategoryId)}</TableCell>
                <TableCell className="hidden xl:table-cell">{subName(t.SubcategoryId)}</TableCell>
                <TableCell className="hidden md:table-cell">{accName(t.AccountId)}</TableCell>
                <TableCell className="text-right"><Amount type={t.Type} value={t.Amount} fmt={fmtEUR} /></TableCell>
                <TableCell><StatusBadge s={t.Status} /></TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="icon" variant="ghost" onClick={() => setView(t)} aria-label="Ver"><Eye className="h-4 w-4" /></Button>
                  {t.Type !== "Transferência" && <Button size="icon" variant="ghost" asChild aria-label="Editar"><Link to="/nova" search={{ id: t.TransactionId }}><Pencil className="h-4 w-4" /></Link></Button>}
                  <Button size="icon" variant="ghost" onClick={() => setConfirm(t)} aria-label="Eliminar"><Trash2 className="h-4 w-4 text-expense" /></Button>
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
          <span>Página {page + 1} de {pages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Seguinte</Button></div>
        </div>
      </Panel>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar movimentação?</AlertDialogTitle><AlertDialogDescription>
            “{confirm?.Description}” será removida do Google Sheets.{confirm?.TransferGroupId && " Ambos os registos da transferência serão eliminados."} Esta ação não pode ser anulada.
          </AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={del.pending} onClick={async (e) => { e.preventDefault(); if (confirm && (await del.run({ TransactionId: confirm.TransactionId, TransferGroupId: confirm.TransferGroupId }, "Movimentação eliminada"))) setConfirm(null); }}>{del.pending ? "A eliminar…" : "Eliminar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent><DialogHeader><DialogTitle>{view?.Description}</DialogTitle></DialogHeader>
          {view && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[["ID", view.TransactionId], ["Tipo", view.Type], ["Valor", fmtEUR(view.Amount)], ["Estado", view.Status], ["Data", fmtDate(view.TransactionDate)], ["Vencimento", fmtDate(view.DueDate)], ["Categoria", catName(view.CategoryId)], ["Subcategoria", subName(view.SubcategoryId)], ["Conta", accName(view.AccountId)], ["Método", view.PaymentMethod || "—"], ["Natureza", view.Nature], ["Recorrência", view.Recurrence], ["Criado", fmtDateTime(view.CreatedAt)], ["Atualizado", fmtDateTime(view.UpdatedAt)], ["Observações", view.Notes || "—"]].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}
          </dl>}
        </DialogContent>
      </Dialog>
    </>
  );
}
