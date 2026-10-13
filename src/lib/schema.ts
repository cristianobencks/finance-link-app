// Spreadsheet structure shared by server and client. Columns are matched by header name.
export const SHEETS = {
  Transactions: [
    "TransactionId", "Type", "Description", "Amount", "TransactionDate", "DueDate",
    "CategoryId", "SubcategoryId", "AccountId", "PaymentMethod", "Status", "Nature",
    "Recurrence", "Notes", "CreatedAt", "UpdatedAt", "TransferGroupId", "Attachment",
  ],
  Categories: ["CategoryId", "Name", "Type", "Color", "Icon", "Active", "CreatedAt", "UpdatedAt"],
  Subcategories: ["SubcategoryId", "CategoryId", "Name", "Active", "CreatedAt", "UpdatedAt"],
  Accounts: [
    "AccountId", "Name", "AccountType", "Institution", "OpeningBalance", "OpeningDate",
    "Currency", "Active", "CreatedAt", "UpdatedAt",
  ],
  Budgets: ["BudgetId", "YearMonth", "CategoryId", "BudgetAmount", "Notes", "CreatedAt", "UpdatedAt"],
  Settings: ["SettingKey", "SettingValue", "UpdatedAt"],
} as const;

export type SheetName = keyof typeof SHEETS;
export const ID_COLUMN: Record<SheetName, string> = {
  Transactions: "TransactionId",
  Categories: "CategoryId",
  Subcategories: "SubcategoryId",
  Accounts: "AccountId",
  Budgets: "BudgetId",
  Settings: "SettingKey",
};

export const TX_TYPES = ["Receita", "Despesa", "Transferência"] as const;
export const TX_STATUS = ["Pendente", "Pago", "Recebido", "Cancelado"] as const;
export const NATURES = ["Fixa", "Variável", "Pontual"] as const;
export const RECURRENCES = ["Não recorrente", "Semanal", "Mensal", "Anual"] as const;
export const ACCOUNT_TYPES = ["Conta bancária", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Outra"] as const;
export const PAYMENT_METHODS = ["Transferência bancária", "MB Way", "Multibanco", "Cartão", "Numerário", "Débito direto", "Outro"] as const;

export type Transaction = {
  TransactionId: string; Type: (typeof TX_TYPES)[number]; Description: string; Amount: number;
  TransactionDate: string; DueDate: string; CategoryId: string; SubcategoryId: string;
  AccountId: string; PaymentMethod: string; Status: (typeof TX_STATUS)[number]; Nature: string;
  Recurrence: string; Notes: string; CreatedAt: string; UpdatedAt: string; TransferGroupId: string;
  /** Storage path of the receipt photo (private bucket), or "" */
  Attachment?: string;
};
export type Category = { CategoryId: string; Name: string; Type: "Receita" | "Despesa"; Color: string; Icon: string; Active: boolean; CreatedAt: string; UpdatedAt: string };
export type Subcategory = { SubcategoryId: string; CategoryId: string; Name: string; Active: boolean; CreatedAt: string; UpdatedAt: string };
export type Account = { AccountId: string; Name: string; AccountType: string; Institution: string; OpeningBalance: number; OpeningDate: string; Currency: string; Active: boolean; CreatedAt: string; UpdatedAt: string };
export type Budget = { BudgetId: string; YearMonth: string; CategoryId: string; BudgetAmount: number; Notes: string; CreatedAt: string; UpdatedAt: string };

export type FinanceData = {
  transactions: Transaction[]; categories: Category[]; subcategories: Subcategory[];
  accounts: Account[]; budgets: Budget[]; settings: Record<string, string>;
};

const SEED_EXPENSE: [string, string, string, string[]][] = [
  ["Moradia", "#3b82f6", "Home", ["Renda", "Condomínio", "Eletricidade", "Água", "Gás", "Internet"]],
  ["Alimentação", "#f97316", "UtensilsCrossed", ["Supermercado", "Restaurantes", "Cafés"]],
  ["Transporte", "#0ea5e9", "Car", ["Combustível", "Transportes públicos", "Estacionamento", "Manutenção"]],
  ["Saúde", "#ef4444", "HeartPulse", ["Consultas", "Farmácia", "Seguros"]],
  ["Família", "#ec4899", "Users", ["Educação", "Vestuário", "Atividades"]],
  ["Lazer", "#a855f7", "Plane", ["Viagens", "Cinema", "Subscrições"]],
  ["Trabalho", "#64748b", "Briefcase", ["Software", "Equipamentos", "Despesas profissionais"]],
  ["Financeiro", "#eab308", "Landmark", ["Comissões bancárias", "Juros", "Impostos"]],
  ["Outros", "#94a3b8", "Tag", ["Despesas diversas"]],
];
const SEED_INCOME: [string, string, string, string[]][] = [
  ["Trabalho", "#16a34a", "Briefcase", ["Salário", "Prémios", "Subsídios"]],
  ["Consultoria", "#059669", "Lightbulb", ["Projetos", "Serviços"]],
  ["Negócios", "#0d9488", "Store", ["Vendas", "Comissões"]],
  ["Investimentos", "#65a30d", "TrendingUp", ["Juros", "Dividendos"]],
  ["Reembolsos", "#10b981", "RotateCcw", ["Despesas reembolsadas"]],
  ["Outros", "#84cc16", "Tag", ["Receitas diversas"]],
];

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Deterministic IDs so re-running setup never duplicates seeded rows. */
export function seedRows() {
  const cats: Omit<Category, "CreatedAt" | "UpdatedAt">[] = [];
  const subs: Omit<Subcategory, "CreatedAt" | "UpdatedAt">[] = [];
  for (const [type, list] of [["Despesa", SEED_EXPENSE], ["Receita", SEED_INCOME]] as const) {
    for (const [name, color, icon, children] of list) {
      const id = `cat-${type === "Despesa" ? "d" : "r"}-${slug(name)}`;
      cats.push({ CategoryId: id, Name: name, Type: type, Color: color, Icon: icon, Active: true });
      for (const c of children) subs.push({ SubcategoryId: `${id}-${slug(c)}`, CategoryId: id, Name: c, Active: true });
    }
  }
  return { cats, subs };
}
