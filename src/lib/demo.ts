// Demo mode: fictitious data kept only in memory. Never touches Google Sheets.
import { seedRows, type FinanceData, type Transaction } from "./schema";

const KEY = "mcf-demo";
export const isDemo = () => typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1";
export function startDemo() { sessionStorage.setItem(KEY, "1"); store = null; }
export function endDemo() { sessionStorage.removeItem(KEY); store = null; }

type Data = FinanceData & { spreadsheetUrl: string; isOwner: boolean };
let store: Data | null = null;
const now = () => new Date().toISOString();

function build(): Data {
  const ts = now();
  const { cats, subs } = seedRows();
  const accounts = [
    { AccountId: "demo-acc-banco", Name: "Conta à ordem (demo)", AccountType: "Conta bancária", Institution: "Banco Exemplo", OpeningBalance: 2500 },
    { AccountId: "demo-acc-poupanca", Name: "Poupança (demo)", AccountType: "Conta bancária", Institution: "Banco Exemplo", OpeningBalance: 5000 },
    { AccountId: "demo-acc-cash", Name: "Carteira (demo)", AccountType: "Dinheiro", Institution: "", OpeningBalance: 150 },
  ].map((a) => ({ ...a, OpeningDate: "2026-01-01", Currency: "EUR", Active: true, CreatedAt: ts, UpdatedAt: ts }));
  const d = new Date();
  const ym = (back: number) => { const x = new Date(d.getFullYear(), d.getMonth() - back, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
  const transactions: Transaction[] = [];
  const tx = (id: string, Type: "Receita" | "Despesa", Description: string, Amount: number, date: string, CategoryId: string, SubcategoryId: string, Status: Transaction["Status"], Nature = "Fixa", AccountId = "demo-acc-banco") =>
    transactions.push({ TransactionId: id, Type, Description, Amount, TransactionDate: date, DueDate: "", CategoryId, SubcategoryId, AccountId, PaymentMethod: "Transferência bancária", Status, Nature, Recurrence: Nature === "Fixa" ? "Mensal" : "Não recorrente", Notes: "", CreatedAt: ts, UpdatedAt: ts, TransferGroupId: "" });
  for (let b = 3; b >= 0; b--) {
    const m = ym(b);
    const st = (s: Transaction["Status"]) => (b === 0 ? "Pendente" : s);
    tx(`demo-sal-${m}`, "Receita", "Salário", 2200, `${m}-01`, "cat-r-trabalho", "cat-r-trabalho-salario", "Recebido");
    tx(`demo-renda-${m}`, "Despesa", "Renda da casa", 850, `${m}-05`, "cat-d-moradia", "cat-d-moradia-renda", "Pago");
    tx(`demo-luz-${m}`, "Despesa", "Eletricidade", 60 + b * 7, `${m}-12`, "cat-d-moradia", "cat-d-moradia-eletricidade", st("Pago"));
    tx(`demo-super-${m}`, "Despesa", "Supermercado", 320 - b * 15, `${m}-09`, "cat-d-alimentacao", "cat-d-alimentacao-supermercado", "Pago", "Variável");
    tx(`demo-rest-${m}`, "Despesa", "Jantar fora", 45 + b * 10, `${m}-18`, "cat-d-alimentacao", "cat-d-alimentacao-restaurantes", "Pago", "Variável", "demo-acc-cash");
    tx(`demo-comb-${m}`, "Despesa", "Combustível", 70, `${m}-15`, "cat-d-transporte", "cat-d-transporte-combustivel", "Pago", "Variável");
    tx(`demo-net-${m}`, "Despesa", "Subscrições streaming", 18, `${m}-20`, "cat-d-lazer", "cat-d-lazer-subscricoes", st("Pago"));
    if (b % 2 === 0) tx(`demo-cons-${m}`, "Receita", "Projeto de consultoria", 600, `${m}-22`, "cat-r-consultoria", "cat-r-consultoria-projetos", st("Recebido"), "Pontual");
  }
  const cur = ym(0);
  const budgets = [["cat-d-alimentacao", 450], ["cat-d-moradia", 950], ["cat-d-lazer", 80]].map(([c, v]) => ({ BudgetId: `demo-b-${c}`, YearMonth: cur, CategoryId: c as string, BudgetAmount: v as number, Notes: "", CreatedAt: ts, UpdatedAt: ts }));
  return {
    spreadsheetUrl: "",
    isOwner: false,
    transactions,
    categories: cats.map((c) => ({ ...c, CreatedAt: ts, UpdatedAt: ts })),
    subcategories: subs.map((s) => ({ ...s, CreatedAt: ts, UpdatedAt: ts })),
    accounts, budgets, settings: {},
  };
}

export function demoData(): Data { if (!store) store = build(); return structuredClone(store); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
function upsert(list: Row[], idKey: string, row: Row) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const i = list.findIndex((r) => r[idKey] === row[idKey]);
  const ts = now();
  const { expectedUpdatedAt: _x, ...clean } = row;
  if (i >= 0) list[i] = { ...list[i], ...clean, UpdatedAt: ts };
  else list.push({ ...clean, CreatedAt: ts, UpdatedAt: ts });
}
const S = () => { demoData(); return store as unknown as { transactions: Row[]; categories: Row[]; subcategories: Row[]; accounts: Row[]; budgets: Row[] }; };
const ok = { ok: true as const };

/** Demo handlers, same input shape as the server functions. */
export const demo = {
  saveTransaction: async ({ data }: { data: Row }) => { upsert(S().transactions, "TransactionId", { ...data, TransferGroupId: "" }); return ok; },
  saveTransfer: async ({ data }: { data: Row }) => {
    const g = data.TransferGroupId as string;
    const st = (leg: string) => (data.Status === "Efetuada" ? leg : (data.Status as string));
    const base = { Type: "Transferência", Description: data.Description, Amount: data.Amount, TransactionDate: data.TransactionDate, DueDate: "", CategoryId: "", SubcategoryId: "", PaymentMethod: "Transferência bancária", Nature: "Pontual", Recurrence: "Não recorrente", Notes: data.Notes, TransferGroupId: g };
    upsert(S().transactions, "TransactionId", { ...base, TransactionId: `${g}-out`, AccountId: data.FromAccountId, Status: st("Pago") });
    upsert(S().transactions, "TransactionId", { ...base, TransactionId: `${g}-in`, AccountId: data.ToAccountId, Status: st("Recebido") });
    return ok;
  },
  deleteTransaction: async ({ data }: { data: Row }) => {
    const s = S();
    s.transactions = s.transactions.filter((t) => (data.TransferGroupId ? t.TransferGroupId !== data.TransferGroupId : t.TransactionId !== data.TransactionId));
    return ok;
  },
  saveCategory: async ({ data }: { data: Row }) => { upsert(S().categories, "CategoryId", data); return ok; },
  saveSubcategory: async ({ data }: { data: Row }) => { upsert(S().subcategories, "SubcategoryId", data); return ok; },
  saveAccount: async ({ data }: { data: Row }) => { upsert(S().accounts, "AccountId", data); return ok; },
  saveBudget: async ({ data }: { data: Row }) => { upsert(S().budgets, "BudgetId", data); return ok; },
  deleteBudget: async ({ data }: { data: Row }) => { const s = S(); s.budgets = s.budgets.filter((b) => b.BudgetId !== data.BudgetId); return ok; },
};
