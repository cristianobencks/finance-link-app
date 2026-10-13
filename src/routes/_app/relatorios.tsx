import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { useFinance } from "@/hooks/use-finance";
import { PageHeader, Panel, Empty, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accountBalance, downloadCSV, fmtDate, fmtEUR, fmtMonth, isSettled, lastMonths, monthSummary, round, todayLisbon, ym } from "@/lib/finance";

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Meu Controle Financeiro" }, { name: "description", content: "Relatórios de receitas, despesas, categorias e saldo." }, { property: "og:title", content: "Relatórios" }, { property: "og:description", content: "Relatórios de receitas, despesas, categorias e saldo." }] }),
  component: Reports,
});

function Reports() {
  const d = useFinance();
  const today = todayLisbon();
  const [to, setTo] = useState(ym(today));
  const [span, setSpan] = useState("12");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");

  const months = lastMonths(to, Number(span));
  const txs = useMemo(() => (d?.transactions ?? []).filter((t) => (account === "all" || t.AccountId === account) && (category === "all" || t.CategoryId === category) && (type === "all" || t.Type === type)), [d, account, category, type]);
  if (!d) return null;
  const inRange = txs.filter((t) => months.includes(ym(t.TransactionDate)));
  const catName = (id: string) => d.categories.find((c) => c.CategoryId === id)?.Name ?? "Sem categoria";
  const subName = (id: string) => d.subcategories.find((c) => c.SubcategoryId === id)?.Name ?? "Sem subcategoria";
  const accName = (id: string) => d.accounts.find((a) => a.AccountId === id)?.Name ?? "—";

  const monthly = months.map((m) => { const s = monthSummary(txs, m); return { m, name: fmtMonth(m), Receitas: s.income, Despesas: s.expense, Resultado: s.result }; });
  const paidExp = inRange.filter((t) => t.Type === "Despesa" && t.Status === "Pago");
  const group = (key: (t: (typeof paidExp)[number]) => string) => { const m = new Map<string, number>(); paidExp.forEach((t) => m.set(key(t), (m.get(key(t)) ?? 0) + t.Amount)); return [...m].map(([k, v]) => ({ k, v: round(v) })).sort((a, b) => b.v - a.v); };
  const byCat = group((t) => catName(t.CategoryId));
  const bySub = group((t) => `${catName(t.CategoryId)} › ${subName(t.SubcategoryId)}`);
  const fixedVar = months.map((m) => { const x = paidExp.filter((t) => ym(t.TransactionDate) === m); const s = (n: string) => round(x.filter((t) => t.Nature === n).reduce((a, t) => a + t.Amount, 0)); return { name: fmtMonth(m), Fixa: s("Fixa"), Variável: s("Variável"), Pontual: s("Pontual") }; });
  const byAccount = d.accounts.map((a) => { const x = inRange.filter((t) => t.AccountId === a.AccountId && isSettled(t)); return { name: a.Name, Entradas: round(x.filter((t) => t.Status === "Recebido").reduce((s, t) => s + t.Amount, 0)), Saídas: round(x.filter((t) => t.Status === "Pago").reduce((s, t) => s + t.Amount, 0)) }; });
  const balanceSeries = months.map((m) => {
    const cut = d.transactions.filter((t) => ym(t.TransactionDate) <= m);
    const accs = d.accounts.filter((a) => (account === "all" || a.AccountId === account) && ym(a.OpeningDate) <= m);
    return { name: fmtMonth(m), Saldo: round(accs.reduce((s, a) => s + accountBalance(a, cut), 0)) };
  });
  const half = Math.floor(months.length / 2);
  const periodA = monthly.slice(0, half), periodB = monthly.slice(half);
  const sum = (arr: typeof monthly, k: "Receitas" | "Despesas" | "Resultado") => round(arr.reduce((s, x) => s + x[k], 0));
  const pending = txs.filter((t) => t.Status === "Pendente" && t.Type !== "Transferência").sort((a, b) => (a.DueDate || a.TransactionDate).localeCompare(b.DueDate || b.TransactionDate));

  function exportCSV() {
    downloadCSV("relatorio.csv", [
      ["Mês", "Receitas", "Despesas", "Resultado"], ...monthly.map((x) => [x.name, x.Receitas, x.Despesas, x.Resultado]), [],
      ["Categoria", "Despesas pagas"], ...byCat.map((x) => [x.k, x.v]), [],
      ["Subcategoria", "Despesas pagas"], ...bySub.map((x) => [x.k, x.v]), [],
      ["Conta", "Entradas", "Saídas"], ...byAccount.map((x) => [x.name, x.Entradas, x.Saídas]), [],
      ["Pendentes", "Tipo", "Vencimento", "Valor"], ...pending.map((t) => [t.Description, t.Type, fmtDate(t.DueDate || t.TransactionDate), t.Amount]),
    ]);
  }

  const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" };
  const tip = <Tooltip formatter={(v: number) => fmtEUR(v)} />;

  return (
    <>
      <PageHeader title="Relatórios" subtitle={`${fmtMonth(months[0] ?? to)} – ${fmtMonth(to)}`} actions={<Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4" />Exportar CSV</Button>} />
      <div className="mb-6 flex flex-wrap gap-2">
        <Input type="month" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-44 bg-card" />
        <Select value={span} onValueChange={setSpan}><SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger><SelectContent>{["3", "6", "12", "24"].map((s) => <SelectItem key={s} value={s}>Últimos {s} meses</SelectItem>)}</SelectContent></Select>
        <Select value={account} onValueChange={setAccount}><SelectTrigger className="w-44 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as contas</SelectItem>{d.accounts.map((a) => <SelectItem key={a.AccountId} value={a.AccountId}>{a.Name}</SelectItem>)}</SelectContent></Select>
        <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-48 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{d.categories.map((c) => <SelectItem key={c.CategoryId} value={c.CategoryId}>{c.Name} ({c.Type})</SelectItem>)}</SelectContent></Select>
        <Select value={type} onValueChange={setType}><SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem><SelectItem value="Receita">Receitas</SelectItem><SelectItem value="Despesa">Despesas</SelectItem></SelectContent></Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Receitas vs. despesas por mês"><div className="h-72"><ResponsiveContainer><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} />{tip}<Legend /><Bar dataKey="Receitas" fill="var(--income)" radius={[6, 6, 0, 0]} /><Bar dataKey="Despesas" fill="var(--expense)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
        <Panel title="Evolução do saldo"><div className="h-72"><ResponsiveContainer><LineChart data={balanceSeries}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} />{tip}<Line dataKey="Saldo" stroke="var(--primary)" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div></Panel>
        <Panel title="Despesas fixas vs. variáveis"><div className="h-72"><ResponsiveContainer><BarChart data={fixedVar}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} />{tip}<Legend /><Bar dataKey="Fixa" stackId="a" fill="var(--chart-3)" /><Bar dataKey="Variável" stackId="a" fill="var(--chart-2)" /><Bar dataKey="Pontual" stackId="a" fill="var(--chart-4)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
        <Panel title="Movimentações por conta">{byAccount.length === 0 ? <Empty>Sem contas.</Empty> : <div className="h-72"><ResponsiveContainer><BarChart data={byAccount}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} />{tip}<Legend /><Bar dataKey="Entradas" fill="var(--income)" radius={[6, 6, 0, 0]} /><Bar dataKey="Saídas" fill="var(--expense)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}</Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Despesas por categoria"><RankTable rows={byCat} /></Panel>
        <Panel title="Despesas por subcategoria"><RankTable rows={bySub} /></Panel>
        <Panel title="Comparação entre períodos">
          {half === 0 ? <Empty>Escolha um período maior.</Empty> : <Table><TableHeader><TableRow><TableHead /><TableHead className="text-right">{fmtMonth(periodA[0]!.m)}–{fmtMonth(periodA.at(-1)!.m)}</TableHead><TableHead className="text-right">{fmtMonth(periodB[0]!.m)}–{fmtMonth(periodB.at(-1)!.m)}</TableHead></TableRow></TableHeader>
            <TableBody>{(["Receitas", "Despesas", "Resultado"] as const).map((k) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="tabular text-right">{fmtEUR(sum(periodA, k))}</TableCell><TableCell className="tabular text-right">{fmtEUR(sum(periodB, k))}</TableCell></TableRow>)}</TableBody></Table>}
        </Panel>
        <Panel title="Pendentes e vencidas">
          {pending.length === 0 ? <Empty>Nada pendente.</Empty> : <Table><TableBody>{pending.slice(0, 12).map((t) => { const due = t.DueDate || t.TransactionDate; return (
            <TableRow key={t.TransactionId}><TableCell className="font-medium">{t.Description}<div className="text-xs text-muted-foreground">{accName(t.AccountId)}</div></TableCell><TableCell className={due < today ? "text-expense" : ""}>{fmtDate(due)}{due < today && " (vencida)"}</TableCell><TableCell><StatusBadge s={t.Status} /></TableCell><TableCell className="tabular text-right">{fmtEUR(t.Amount)}</TableCell></TableRow>); })}</TableBody></Table>}
        </Panel>
      </div>
    </>
  );
}

function RankTable({ rows }: { rows: { k: string; v: number }[] }) {
  if (!rows.length) return <Empty>Sem despesas pagas no período.</Empty>;
  const total = rows.reduce((s, r) => s + r.v, 0);
  return (
    <ul className="space-y-3">{rows.slice(0, 10).map((r) => (
      <li key={r.k}>
        <div className="flex justify-between text-sm"><span className="truncate">{r.k}</span><span className="tabular font-medium">{fmtEUR(r.v)}</span></div>
        <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-expense" style={{ width: `${(r.v / total) * 100}%` }} /></div>
      </li>))}
    </ul>
  );
}
