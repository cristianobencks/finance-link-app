import type { Account, Budget, Transaction } from "./schema";

/** A movement is settled (counts toward balances/totals) only when Pago or Recebido. */
export const isSettled = (t: Transaction) => t.Status === "Pago" || t.Status === "Recebido";
export const ym = (date: string) => date.slice(0, 7);

/** Balance = opening + settled inflows (Recebido) − settled outflows (Pago), transfers included. */
export function accountBalance(acc: Account, txs: Transaction[]) {
  let b = acc.OpeningBalance;
  for (const t of txs) {
    if (t.AccountId !== acc.AccountId || !isSettled(t)) continue;
    if (acc.OpeningDate && t.TransactionDate < acc.OpeningDate) continue;
    b += t.Status === "Recebido" ? t.Amount : -t.Amount;
  }
  return round(b);
}

export const round = (n: number) => Math.round(n * 100) / 100;

export type ExpenseCandidate = { TransactionId: string; Type: string; Description: string; TransactionDate: string; Status: string; Amount: number | string };

/** A possible duplicate is another non-cancelled expense with the same date and cents. */
export function duplicateExpenses(candidate: ExpenseCandidate, existing: ExpenseCandidate[]) {
  if (candidate.Type !== "Despesa" || candidate.Status === "Cancelado") return [];
  const cents = (amount: number | string) => Math.round(Number(String(amount).replace(",", ".")) * 100);
  return existing.filter((t) => t.TransactionId !== candidate.TransactionId && t.Type === "Despesa" &&
    t.Status !== "Cancelado" && t.TransactionDate === candidate.TransactionDate && cents(t.Amount) === cents(candidate.Amount));
}

export function expenseFromRow(r: Record<string, string | undefined>): ExpenseCandidate {
  return { TransactionId: r["TransactionId"] ?? "", Type: r["Type"] ?? "", Description: r["Description"] ?? "",
    TransactionDate: r["TransactionDate"] ?? "", Status: r["Status"] ?? "", Amount: r["Amount"] ?? "0" };
}

/** Income/expense totals for a month. Transfers are never income or expense. */
export function monthSummary(txs: Transaction[], month: string) {
  let income = 0, expense = 0, pendingIncome = 0, pendingExpense = 0;
  for (const t of txs) {
    if (t.Type === "Transferência" || ym(t.TransactionDate) !== month) continue;
    if (t.Type === "Receita") {
      if (t.Status === "Recebido") income += t.Amount;
      else if (t.Status === "Pendente") pendingIncome += t.Amount;
    } else if (t.Type === "Despesa") {
      if (t.Status === "Pago") expense += t.Amount;
      else if (t.Status === "Pendente") pendingExpense += t.Amount;
    }
  }
  const result = income - expense;
  return {
    income: round(income), expense: round(expense), result: round(result),
    pendingIncome: round(pendingIncome), pendingExpense: round(pendingExpense),
    savingsRate: income > 0 ? result / income : null,
  };
}

export function budgetSpent(b: Budget, txs: Transaction[]) {
  return round(
    txs.filter((t) => t.Type === "Despesa" && t.Status === "Pago" && t.CategoryId === b.CategoryId && ym(t.TransactionDate) === b.YearMonth)
      .reduce((s, t) => s + t.Amount, 0),
  );
}

export function prevMonth(month: string) {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function lastMonths(month: string, n: number) {
  const out = [month];
  while (out.length < n) out.unshift(prevMonth(out[0]!));
  return out;
}

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const fmtEUR = (n: number) => eur.format(n);
export const fmtDate = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
export const fmtDateTime = (iso: string) =>
  iso ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(iso)) : "—";
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const fmtMonth = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export function todayLisbon() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

export function toCSV(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}
export function downloadCSV(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
