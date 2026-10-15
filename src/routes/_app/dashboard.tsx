import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { ArrowDownRight, ArrowUpRight, Wallet, Clock, PiggyBank, Plus } from "lucide-react";
import { useFinance } from "@/hooks/use-finance";
import { MarketQuotes } from "@/components/app/MarketQuotes";
import { PageHeader, Panel, Stat, Empty, StatusBadge, Amount } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountBalance, fmtDate, fmtEUR, fmtMonth, isSettled, lastMonths, monthSummary, prevMonth, todayLisbon, ym } from "@/lib/finance";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — EvoluaX" }, { name: "description", content: "Resumo financeiro mensal e cotações de euro, dólar americano e bitcoin." }, { property: "og:title", content: "Dashboard — EvoluaX" }, { property: "og:description", content: "Resumo financeiro mensal e cotações de euro, dólar americano e bitcoin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

function Dashboard() {
  const d = useFinance();
  const today = todayLisbon();
  const [month, setMonth] = useState(ym(today));
  const [account, setAccount] = useState("all");
  const [type, setType] = useState("all");

  const txs = useMemo(() => (d?.transactions ?? []).filter((t) => (account === "all" || t.AccountId === account) && (type === "all" || t.Type === type)), [d, account, type]);
  if (!d) return null;

  const cat = (id: string) => d.categories.find((c) => c.CategoryId === id);
  const acc = (id: string) => d.accounts.find((a) => a.AccountId === id)?.Name ?? "—";
  const accounts = d.accounts.filter((a) => account === "all" || a.AccountId === account);
  const total = accounts.reduce((s, a) => s + accountBalance(a, d.transactions), 0);
  const cur = monthSummary(txs, month);
  const prev = monthSummary(txs, prevMonth(month));
  const delta = (a: number, b: number) => (b === 0 ? null : (a - b) / b);

  const months = lastMonths(month, 6);
  const chart = months.map((m) => { const s = monthSummary(txs, m); return { name: fmtMonth(m), Receitas: s.income, Despesas: s.expense }; });
  const byCat = new Map<string, number>();
  txs.filter((t) => t.Type === "Despesa" && t.Status === "Pago" && ym(t.TransactionDate) === month).forEach((t) => byCat.set(t.CategoryId, (byCat.get(t.CategoryId) ?? 0) + t.Amount));
  const pie = [...byCat].map(([id, v]) => ({ name: cat(id)?.Name ?? "Sem categoria", value: Math.round(v * 100) / 100, color: cat(id)?.Color ?? "#94a3b8" })).sort((a, b) => b.value - a.value);
  const recent = [...txs].filter((t) => t.Type !== "Transferência" || t.TransactionId.endsWith("-out")).sort((a, b) => b.TransactionDate.localeCompare(a.TransactionDate) || b.CreatedAt.localeCompare(a.CreatedAt)).slice(0, 6);
  const upcoming = txs.filter((t) => t.Status === "Pendente" && t.Type !== "Transferência").sort((a, b) => (a.DueDate || a.TransactionDate).localeCompare(b.DueDate || b.TransactionDate)).slice(0, 6);
  const yearOptions = Array.from(new Set([...d.transactions.map((t) => ym(t.TransactionDate)), ym(today)])).filter(Boolean).sort().reverse();

  const DeltaHint = ({ v, good }: { v: number | null; good: "up" | "down" }) =>
    v === null ? <>Sem dados no mês anterior</> : <span className={(v >= 0) === (good === "up") ? "text-income" : "text-expense"}>{v >= 0 ? "▲" : "▼"} {Math.abs(v * 100).toFixed(1)}% vs. mês anterior</span>;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Resumo de ${fmtMonth(month)}`} actions={<Button asChild><Link to="/nova"><Plus className="h-4 w-4" />Nova movimentação</Link></Button>} />
      <MarketQuotes />
      <div className="mb-6 flex flex-wrap gap-2">
        <Select value={month} onValueChange={setMonth}><SelectTrigger className="w-40 bg-card"><SelectValue /></SelectTrigger><SelectContent>{yearOptions.map((m) => <SelectItem key={m} value={m}>{fmtMonth(m)}</SelectItem>)}</SelectContent></Select>
        <Select value={account} onValueChange={setAccount}><SelectTrigger className="w-48 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as contas</SelectItem>{d.accounts.map((a) => <SelectItem key={a.AccountId} value={a.AccountId}>{a.Name}</SelectItem>)}</SelectContent></Select>
        <Select value={type} onValueChange={setType}><SelectTrigger className="w-40 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem><SelectItem value="Receita">Receitas</SelectItem><SelectItem value="Despesa">Despesas</SelectItem></SelectContent></Select>
      </div>

      {d.accounts.length === 0 && <div className="mb-6 rounded-xl border border-dashed bg-card p-4 text-sm">Ainda não tem contas. <Link to="/contas" className="font-medium text-primary">Adicione a primeira conta</Link> para começar a registar movimentações.</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Saldo total" value={fmtEUR(total)} icon={<Wallet className="h-4 w-4" />} hint={`${accounts.length} conta(s)`} />
        <Stat label="Receitas recebidas" value={fmtEUR(cur.income)} tone="income" icon={<ArrowUpRight className="h-4 w-4" />} hint={<DeltaHint v={delta(cur.income, prev.income)} good="up" />} />
        <Stat label="Despesas pagas" value={fmtEUR(cur.expense)} tone="expense" icon={<ArrowDownRight className="h-4 w-4" />} hint={<DeltaHint v={delta(cur.expense, prev.expense)} good="down" />} />
        <Stat label="Resultado do mês" value={fmtEUR(cur.result)} tone={cur.result >= 0 ? "income" : "expense"} icon={<PiggyBank className="h-4 w-4" />} hint={cur.savingsRate === null ? "Taxa de poupança indisponível" : `Taxa de poupança: ${(cur.savingsRate * 100).toFixed(1)}%`} />
        <Stat label="Despesas pendentes" value={fmtEUR(cur.pendingExpense)} tone="warning" icon={<Clock className="h-4 w-4" />} />
        <Stat label="Receitas pendentes" value={fmtEUR(cur.pendingIncome)} tone="warning" icon={<Clock className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-5">
        <Panel title="Receitas vs. despesas (6 meses)" className="xl:col-span-3">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" /><YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v) => `${v} €`} /><Tooltip formatter={(v: number) => fmtEUR(v)} /><Legend /><Bar dataKey="Receitas" fill="var(--income)" radius={[6, 6, 0, 0]} /><Bar dataKey="Despesas" fill="var(--expense)" radius={[6, 6, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Despesas por categoria" className="xl:col-span-2">
          {pie.length === 0 ? <Empty>Sem despesas pagas neste mês.</Empty> : (
            <div className="h-72"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>{pie.map((p) => <Cell key={p.name} fill={p.color} />)}</Pie><Tooltip formatter={(v: number) => fmtEUR(v)} /><Legend /></PieChart></ResponsiveContainer></div>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Últimas movimentações" action={<Link to="/movimentacoes" className="text-xs font-medium text-primary">Ver todas</Link>}>
          {recent.length === 0 ? <Empty>Ainda não há movimentações.</Empty> : (
            <ul className="divide-y">{recent.map((t) => (
              <li key={t.TransactionId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{t.Description}</p><p className="text-xs text-muted-foreground">{fmtDate(t.TransactionDate)} · {t.Type === "Transferência" ? "Transferência" : cat(t.CategoryId)?.Name} · {acc(t.AccountId)}</p></div>
                <div className="text-right"><Amount type={t.Type} value={t.Amount} fmt={fmtEUR} /><div><StatusBadge s={t.Status} /></div></div>
              </li>))}</ul>
          )}
        </Panel>
        <Panel title="Próximos pagamentos e recebimentos">
          {upcoming.length === 0 ? <Empty>Nada pendente.</Empty> : (
            <ul className="divide-y">{upcoming.map((t) => {
              const due = t.DueDate || t.TransactionDate;
              return (
                <li key={t.TransactionId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{t.Description}</p><p className={due < today ? "text-xs text-expense" : "text-xs text-muted-foreground"}>{due < today ? "Vencido a " : "Vence a "}{fmtDate(due)}</p></div>
                  <Amount type={t.Type} value={t.Amount} fmt={fmtEUR} />
                </li>);
            })}</ul>
          )}
        </Panel>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">{d.transactions.filter(isSettled).length} movimentações liquidadas carregadas do Google Sheets.</p>
    </>
  );
}
