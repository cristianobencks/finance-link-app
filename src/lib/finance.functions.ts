import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TX_TYPES, TX_STATUS, NATURES, RECURRENCES, ACCOUNT_TYPES, type FinanceData } from "./schema";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code: number };

async function guarded<T>(userId: string, fn: () => Promise<T>, allowClaim = false): Promise<Result<T>> {
  const s = await import("./sheets.server");
  try {
    await ensureOwner(userId, allowClaim);
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof s.SheetsError) return { ok: false, error: e.message, code: e.status };
    console.error("finance op failed", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "Ocorreu um erro inesperado. A operação não foi concluída.", code: 500 };
  }
}

/** Private app: the first signed-in user claims ownership (stored in Settings); others are refused. */
async function ensureOwner(userId: string, allowClaim: boolean) {
  const s = await import("./sheets.server");
  let all;
  try {
    all = await s.readAll();
  } catch (e) {
    if (allowClaim && e instanceof s.SheetsError && e.status === 409) return; // not initialised yet
    throw e;
  }
  const owner = all.Settings.rows.find((r) => r.obj.SettingKey === "OwnerUserId")?.obj.SettingValue;
  if (!owner) {
    await s.upsert("Settings", { SettingKey: "OwnerUserId", SettingValue: userId });
    return;
  }
  if (owner !== userId) throw new s.SheetsError("Esta conta não tem acesso a esta aplicação privada.", 403);
}

const num = (v: string | undefined = "") => (v === "" ? 0 : Number(String(v).replace(",", ".")) || 0);
const bool = (v: string | undefined = "") => v === "" || v.toUpperCase() === "TRUE";

export const getFinanceData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result<FinanceData & { spreadsheetUrl: string }>> => {
    return guarded(context.userId, async () => {
      const s = await import("./sheets.server");
      const t = await s.readAll();
      const rows = (n: keyof typeof t) => t[n].rows.map((r) => r.obj);
      return {
        spreadsheetUrl: s.spreadsheetUrl(),
        transactions: rows("Transactions").map((r) => ({ ...r, Amount: num(r.Amount) })) as FinanceData["transactions"],
        categories: rows("Categories").map((r) => ({ ...r, Active: bool(r.Active) })) as FinanceData["categories"],
        subcategories: rows("Subcategories").map((r) => ({ ...r, Active: bool(r.Active) })) as FinanceData["subcategories"],
        accounts: rows("Accounts").map((r) => ({ ...r, OpeningBalance: num(r.OpeningBalance), Active: bool(r.Active) })) as FinanceData["accounts"],
        budgets: rows("Budgets").map((r) => ({ ...r, BudgetAmount: num(r.BudgetAmount) })) as FinanceData["budgets"],
        settings: Object.fromEntries(
          rows("Settings").filter((r) => r.SettingKey !== "OwnerUserId").map((r) => [r.SettingKey, r.SettingValue]),
        ),
      };
    });
  });

export const initializeSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("./sheets.server");
    // Run setup first (idempotent), then claim/verify ownership.
    try {
      await ensureOwner(context.userId, true);
      const r = await s.initialize();
      await ensureOwner(context.userId, false);
      return { ok: true as const, data: r };
    } catch (e) {
      if (e instanceof s.SheetsError) return { ok: false as const, error: e.message, code: e.status };
      return { ok: false as const, error: "Falha na configuração inicial.", code: 500 };
    }
  });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const id = z.string().min(6).max(64).regex(/^[A-Za-z0-9_-]+$/);

const txSchema = z.object({
  TransactionId: id,
  Type: z.enum(["Receita", "Despesa"]),
  Description: z.string().trim().min(1).max(200),
  Amount: z.number().positive().max(1e9),
  TransactionDate: isoDate,
  DueDate: isoDate.or(z.literal("")),
  CategoryId: z.string().min(1),
  SubcategoryId: z.string(),
  AccountId: z.string().min(1),
  PaymentMethod: z.string().max(60),
  Status: z.enum(TX_STATUS),
  Nature: z.enum(NATURES),
  Recurrence: z.enum(RECURRENCES),
  Notes: z.string().max(1000),
  expectedUpdatedAt: z.string().optional(),
});

export const saveTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => txSchema.parse(d))
  .handler(async ({ data, context }) =>
    guarded(context.userId, async () => {
      const s = await import("./sheets.server");
      if (data.Type === "Receita" && data.Status === "Pago") throw new s.SheetsError("Uma receita não pode estar 'Pago'.", 400);
      if (data.Type === "Despesa" && data.Status === "Recebido") throw new s.SheetsError("Uma despesa não pode estar 'Recebido'.", 400);
      const { expectedUpdatedAt, ...row } = data;
      return s.upsert("Transactions", { ...row, TransferGroupId: "" }, expectedUpdatedAt);
    }),
  );

const transferSchema = z.object({
  TransferGroupId: id,
  FromAccountId: z.string().min(1),
  ToAccountId: z.string().min(1),
  Amount: z.number().positive().max(1e9),
  TransactionDate: isoDate,
  Description: z.string().trim().min(1).max(200),
  Status: z.enum(["Pendente", "Efetuada", "Cancelado"]),
  Notes: z.string().max(1000),
});

/** A transfer creates two linked rows (out: Pago from origin, in: Recebido to destination). */
export const saveTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transferSchema.refine((v) => v.FromAccountId !== v.ToAccountId, "As contas devem ser diferentes").parse(d))
  .handler(async ({ data, context }) =>
    guarded(context.userId, async () => {
      const s = await import("./sheets.server");
      const base = {
        Type: "Transferência", Description: data.Description, Amount: data.Amount, TransactionDate: data.TransactionDate,
        DueDate: "", CategoryId: "", SubcategoryId: "", PaymentMethod: "Transferência bancária", Nature: "Pontual",
        Recurrence: "Não recorrente", Notes: data.Notes, TransferGroupId: data.TransferGroupId,
      };
      const st = (leg: "Pago" | "Recebido") => (data.Status === "Efetuada" ? leg : data.Status);
      await s.upsert("Transactions", { ...base, TransactionId: `${data.TransferGroupId}-out`, AccountId: data.FromAccountId, Status: st("Pago") });
      await s.upsert("Transactions", { ...base, TransactionId: `${data.TransferGroupId}-in`, AccountId: data.ToAccountId, Status: st("Recebido") });
      return { ok: true };
    }),
  );

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ TransactionId: z.string().min(1), TransferGroupId: z.string() }).parse(d))
  .handler(async ({ data, context }) =>
    guarded(context.userId, async () => {
      const s = await import("./sheets.server");
      const n = data.TransferGroupId
        ? await s.deleteWhere("Transactions", "TransferGroupId", [data.TransferGroupId])
        : await s.deleteWhere("Transactions", "TransactionId", [data.TransactionId]);
      if (!n) throw new s.SheetsError("Registo não encontrado na folha de cálculo.", 404);
      return { deleted: n };
    }),
  );

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      CategoryId: id, Name: z.string().trim().min(1).max(60), Type: z.enum(["Receita", "Despesa"]),
      Color: z.string().regex(/^#[0-9a-fA-F]{6}$/), Icon: z.string().max(40), Active: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => guarded(context.userId, async () => (await import("./sheets.server")).upsert("Categories", data)));

export const saveSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ SubcategoryId: id, CategoryId: z.string().min(1), Name: z.string().trim().min(1).max(60), Active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => guarded(context.userId, async () => (await import("./sheets.server")).upsert("Subcategories", data)));

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      AccountId: id, Name: z.string().trim().min(1).max(60), AccountType: z.enum(ACCOUNT_TYPES),
      Institution: z.string().max(60), OpeningBalance: z.number().min(-1e9).max(1e9), OpeningDate: isoDate,
      Currency: z.string().length(3), Active: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => guarded(context.userId, async () => (await import("./sheets.server")).upsert("Accounts", data)));

export const saveBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      BudgetId: id, YearMonth: z.string().regex(/^\d{4}-\d{2}$/), CategoryId: z.string().min(1),
      BudgetAmount: z.number().positive().max(1e9), Notes: z.string().max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => guarded(context.userId, async () => (await import("./sheets.server")).upsert("Budgets", data)));

export const deleteBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ BudgetId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) =>
    guarded(context.userId, async () => (await import("./sheets.server")).deleteWhere("Budgets", "BudgetId", [data.BudgetId])),
  );

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ SettingKey: z.string().regex(/^[A-Za-z]+$/).refine((k) => k !== "OwnerUserId"), SettingValue: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => guarded(context.userId, async () => (await import("./sheets.server")).upsert("Settings", data)));

export { TX_TYPES };
