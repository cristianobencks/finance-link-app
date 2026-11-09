import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TX_TYPES, TX_STATUS, NATURES, RECURRENCES, ACCOUNT_TYPES, type FinanceData } from "./schema";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code: number };

type Ctx = { userId: string; claims: { email?: string } & Record<string, unknown> };

async function guarded<T>(ctx: Ctx, fn: (sid: string, isOwner: boolean) => Promise<T>): Promise<Result<T>> {
  const s = await import("./sheets.server");
  try {
    const a = await resolveAccess(ctx);
    return { ok: true, data: await fn(a.sid, a.isOwner) };
  } catch (e) {
    if (e instanceof s.SheetsError) return { ok: false, error: e.message, code: e.status };
    console.error("finance op failed", e instanceof Error ? e.message : "unknown");
    return { ok: false, error: "Ocorreu um erro inesperado. A operação não foi concluída.", code: 500 };
  }
}

/**
 * The first signed-in user owns the master spreadsheet. Other users must have their email
 * in AllowedEmails (master Settings); each gets their own spreadsheet, mapped as Sheet:<userId>.
 */
const accessCache = new Map<string, { sid: string; isOwner: boolean; at: number }>();
const normEmails = (v: string) => v.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);

async function resolveAccess(ctx: Ctx) {
  const hit = accessCache.get(ctx.userId);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const s = await import("./sheets.server");
  const master = s.masterSpreadsheetId();
  let settings;
  try {
    settings = await s.readTable(master, "Settings");
  } catch (e) {
    if (e instanceof s.SheetsError && e.status === 409) {
      await s.initialize(master);
      settings = await s.readTable(master, "Settings");
    } else throw e;
  }
  const get = (k: string) => settings.rows.find((r) => r.obj.SettingKey === k)?.obj.SettingValue ?? "";
  let owner = get("OwnerUserId");
  if (!owner) {
    await s.upsert(master, "Settings", { SettingKey: "OwnerUserId", SettingValue: ctx.userId });
    owner = ctx.userId;
  }
  let res: { sid: string; isOwner: boolean; at: number };
  if (owner === ctx.userId) res = { sid: master, isOwner: true, at: Date.now() };
  else {
    const email = String(ctx.claims.email ?? "").toLowerCase();
    if (!email || !normEmails(get("AllowedEmails")).includes(email)) {
      accessCache.delete(ctx.userId);
      throw new s.SheetsError("Esta conta ainda não foi autorizada. Peça acesso ao administrador.", 403);
    }
    let sid = get(`Sheet:${ctx.userId}`);
    if (!sid) {
      sid = await s.createSpreadsheet(`EvoluaX — ${email}`);
      await s.upsert(master, "Settings", { SettingKey: `Sheet:${ctx.userId}`, SettingValue: sid });
    }
    res = { sid, isOwner: false, at: Date.now() };
  }
  accessCache.set(ctx.userId, res);
  return res;
}

const num = (v: string | undefined = "") => (v === "" ? 0 : Number(String(v).replace(",", ".")) || 0);
const bool = (v: string | undefined = "") => v === "" || v.toUpperCase() === "TRUE";

export const getFinanceData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result<FinanceData & { spreadsheetUrl: string; isOwner: boolean }>> => {
    return guarded(context as Ctx, async (sid, isOwner) => {
      const s = await import("./sheets.server");
      const t = await s.readAll(sid);
      const rows = (n: keyof typeof t) => t[n].rows.map((r) => r.obj);
      return {
        spreadsheetUrl: s.spreadsheetUrl(sid),
        isOwner,
        transactions: rows("Transactions").map((r) => ({ ...r, Amount: num(r.Amount) })) as FinanceData["transactions"],
        categories: rows("Categories").map((r) => ({ ...r, Active: bool(r.Active) })) as FinanceData["categories"],
        subcategories: rows("Subcategories").map((r) => ({ ...r, Active: bool(r.Active) })) as FinanceData["subcategories"],
        accounts: rows("Accounts").map((r) => ({ ...r, OpeningBalance: num(r.OpeningBalance), Active: bool(r.Active) })) as FinanceData["accounts"],
        budgets: rows("Budgets").map((r) => ({ ...r, BudgetAmount: num(r.BudgetAmount) })) as FinanceData["budgets"],
        settings: Object.fromEntries(
          rows("Settings").filter((r) => r.SettingKey !== "OwnerUserId" && r.SettingKey !== "AllowedEmails" && !/^(Sheet|Telegram|TgCode):/.test(r.SettingKey ?? "")).map((r) => [r.SettingKey, r.SettingValue]),
        ),
      };
    });
  });

export const initializeSpreadsheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => guarded(context as Ctx, async (sid) => (await import("./sheets.server")).initialize(sid)));

/** Owner only: emails allowed to sign in (each gets a separate spreadsheet). */
export const getAllowedEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guarded(context as Ctx, async (sid, isOwner) => {
      const s = await import("./sheets.server");
      if (!isOwner) throw new s.SheetsError("Apenas o administrador pode gerir acessos.", 403);
      const t = await s.readTable(sid, "Settings");
      return normEmails(t.rows.find((r) => r.obj.SettingKey === "AllowedEmails")?.obj.SettingValue ?? "");
    }),
  );

export const saveAllowedEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ emails: z.array(z.string().trim().toLowerCase().email()).max(200) }).parse(d))
  .handler(async ({ data, context }) =>
    guarded(context as Ctx, async (sid, isOwner) => {
      const s = await import("./sheets.server");
      if (!isOwner) throw new s.SheetsError("Apenas o administrador pode gerir acessos.", 403);
      await s.upsert(sid, "Settings", { SettingKey: "AllowedEmails", SettingValue: [...new Set(data.emails)].join(",") });
      accessCache.clear();
      return { ok: true };
    }),
  );

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
  Attachment: z.string().max(100).regex(/^(drive:[\w-]+)?$/).optional(),
  expectedUpdatedAt: z.string().optional(),
});

export const saveTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => txSchema.parse(d))
  .handler(async ({ data, context }) =>
    guarded(context as Ctx, async (sid, isOwner) => {
      const s = await import("./sheets.server");
      if (data.Type === "Receita" && data.Status === "Pago") throw new s.SheetsError("Uma receita não pode estar 'Pago'.", 400);
      if (data.Type === "Despesa" && data.Status === "Recebido") throw new s.SheetsError("Uma despesa não pode estar 'Recebido'.", 400);
      const { expectedUpdatedAt, ...row } = data;
      const res = await s.upsert(sid, "Transactions", { ...row, TransferGroupId: "" }, expectedUpdatedAt);
      // Only the owner's expenses go to the owner's Google Calendar.
      if (isOwner) {
        try { await (await import("./calendar.server")).syncExpenseEvent(data); }
        catch (e) { console.error("Calendar sync failed", e); }
      }
      return res;
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
    guarded(context as Ctx, async (sid, isOwner) => {
      const s = await import("./sheets.server");
      const base = {
        Type: "Transferência", Description: data.Description, Amount: data.Amount, TransactionDate: data.TransactionDate,
        DueDate: "", CategoryId: "", SubcategoryId: "", PaymentMethod: "Transferência bancária", Nature: "Pontual",
        Recurrence: "Não recorrente", Notes: data.Notes, TransferGroupId: data.TransferGroupId,
      };
      const st = (leg: "Pago" | "Recebido") => (data.Status === "Efetuada" ? leg : data.Status);
      await s.upsert(sid, "Transactions", { ...base, TransactionId: `${data.TransferGroupId}-out`, AccountId: data.FromAccountId, Status: st("Pago") });
      await s.upsert(sid, "Transactions", { ...base, TransactionId: `${data.TransferGroupId}-in`, AccountId: data.ToAccountId, Status: st("Recebido") });
      return { ok: true };
    }),
  );

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ TransactionId: z.string().min(1), TransferGroupId: z.string() }).parse(d))
  .handler(async ({ data, context }) =>
    guarded(context as Ctx, async (sid, isOwner) => {
      const s = await import("./sheets.server");
      const n = data.TransferGroupId
        ? await s.deleteWhere(sid, "Transactions", "TransferGroupId", [data.TransferGroupId])
        : await s.deleteWhere(sid, "Transactions", "TransactionId", [data.TransactionId]);
      if (!n) throw new s.SheetsError("Registo não encontrado na folha de cálculo.", 404);
      if (isOwner && !data.TransferGroupId) {
        try { await (await import("./calendar.server")).syncExpenseEvent({ TransactionId: data.TransactionId, Type: "", Status: "", Description: "", DueDate: "", TransactionDate: "", Amount: 0 }); }
        catch (e) { console.error("Calendar delete failed", e); }
      }
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
  .handler(async ({ data, context }) => guarded(context as Ctx, async (sid, isOwner) => (await import("./sheets.server")).upsert(sid, "Categories", data)));

export const saveSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ SubcategoryId: id, CategoryId: z.string().min(1), Name: z.string().trim().min(1).max(60), Active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => guarded(context as Ctx, async (sid, isOwner) => (await import("./sheets.server")).upsert(sid, "Subcategories", data)));

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      AccountId: id, Name: z.string().trim().min(1).max(60), AccountType: z.enum(ACCOUNT_TYPES),
      Institution: z.string().max(60), OpeningBalance: z.number().min(-1e9).max(1e9), OpeningDate: isoDate,
      Currency: z.string().length(3), Active: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => guarded(context as Ctx, async (sid, isOwner) => (await import("./sheets.server")).upsert(sid, "Accounts", data)));

export const saveBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      BudgetId: id, YearMonth: z.string().regex(/^\d{4}-\d{2}$/), CategoryId: z.string().min(1),
      BudgetAmount: z.number().positive().max(1e9), Notes: z.string().max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => guarded(context as Ctx, async (sid, isOwner) => (await import("./sheets.server")).upsert(sid, "Budgets", data)));

export const deleteBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ BudgetId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) =>
    guarded(context as Ctx, async (sid, isOwner) => (await import("./sheets.server")).deleteWhere(sid, "Budgets", "BudgetId", [data.BudgetId])),
  );

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ SettingKey: z.string().regex(/^[A-Za-z]+$/).refine((k) => k !== "OwnerUserId"), SettingValue: z.string().max(4000) }).parse(d))
  .handler(async ({ data, context }) => guarded(context as Ctx, async (sid, isOwner) => (await import("./sheets.server")).upsert(sid, "Settings", data)));

export { TX_TYPES };

/** Telegram quick-entry: one-time 6-digit link code (15 min) stored in master Settings as TgCode:<code>. */
export const createTelegramCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guarded(context as Ctx, async () => {
      const s = await import("./sheets.server");
      const master = s.masterSpreadsheetId();
      const uid = (context as Ctx).userId;
      const t = await s.readTable(master, "Settings");
      const stale = t.rows.map((r) => r.obj).filter((r) => r.SettingKey?.startsWith("TgCode:") && (r.SettingValue?.startsWith(uid + "|") || Number(r.SettingValue?.split("|")[1]) < Date.now())).map((r) => r.SettingKey!);
      if (stale.length) await s.deleteWhere(master, "Settings", "SettingKey", stale);
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      const code = String(100000 + ((buf[0] ?? 0) % 900000));
      const expiresAt = Date.now() + 15 * 60_000;
      await s.upsert(master, "Settings", { SettingKey: `TgCode:${code}`, SettingValue: `${uid}|${expiresAt}` });
      return { code, expiresAt, bot: "Evoluax_bot" };
    }),
  );

export const getTelegramStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guarded(context as Ctx, async () => {
      const s = await import("./sheets.server");
      const t = await s.readTable(s.masterSpreadsheetId(), "Settings");
      return { linked: t.rows.some((r) => r.obj.SettingKey?.startsWith("Telegram:") && r.obj.SettingValue === (context as Ctx).userId), bot: "Evoluax_bot" };
    }),
  );

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guarded(context as Ctx, async () => {
      const s = await import("./sheets.server");
      const master = s.masterSpreadsheetId();
      const t = await s.readTable(master, "Settings");
      const keys = t.rows.filter((r) => r.obj.SettingKey?.startsWith("Telegram:") && r.obj.SettingValue === (context as Ctx).userId).map((r) => r.obj.SettingKey!);
      if (keys.length) await s.deleteWhere(master, "Settings", "SettingKey", keys);
      return { removed: keys.length };
    }),
  );
