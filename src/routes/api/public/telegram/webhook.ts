import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const updateSchema = z.object({
  update_id: z.number(),
  message: z.object({ chat: z.object({ id: z.number() }), text: z.string().max(1000).optional() }).passthrough().optional(),
}).passthrough();

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t = await import("@/lib/telegram.server");
        if (!safeEq(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "", t.webhookSecret())) {
          return new Response("Unauthorized", { status: 401 });
        }
        const parsed = updateSchema.safeParse(await request.json().catch(() => null));
        const msg = parsed.success ? parsed.data.message : undefined;
        if (!parsed.success || !msg?.text) return Response.json({ ok: true });
        const chatId = msg.chat.id;
        try {
          await handle(parsed.data.update_id, chatId, msg.text);
        } catch (e) {
          console.error("telegram handle failed", e instanceof Error ? e.message : e);
          await t.reply(chatId, "❌ Não foi possível gravar agora (a folha não respondeu). Nada foi registado. Tente novamente daqui a pouco.");
        }
        return Response.json({ ok: true });
      },
    },
  },
});

async function handle(updateId: number, chatId: number, text: string) {
  const t = await import("@/lib/telegram.server");
  const p = await import("@/lib/telegram");
  const s = await import("@/lib/sheets.server");
  const { fmtEUR, todayLisbon } = await import("@/lib/finance");
  const master = s.masterSpreadsheetId();
  const settings = await s.readTable(master, "Settings");
  const get = (k: string) => settings.rows.find((r) => r.obj.SettingKey === k)?.obj.SettingValue ?? "";

  const code = p.extractLinkCode(text);
  if (code) {
    const [userId, exp] = get(`TgCode:${code}`).split("|");
    await s.deleteWhere(master, "Settings", "SettingKey", [`TgCode:${code}`]);
    if (!userId || Number(exp) < Date.now()) return t.reply(chatId, "⚠️ Código inválido ou expirado. Gere um novo em Configurações no EvoluaX.");
    // One chat per user: remove previous links of this user or this chat.
    const old = settings.rows.filter((r) => r.obj.SettingKey?.startsWith("Telegram:") && (r.obj.SettingValue === userId || r.obj.SettingKey === `Telegram:${chatId}`)).map((r) => r.obj.SettingKey!);
    if (old.length) await s.deleteWhere(master, "Settings", "SettingKey", old);
    await s.upsert(master, "Settings", { SettingKey: `Telegram:${chatId}`, SettingValue: userId });
    return t.reply(chatId, "✅ Telegram ligado ao EvoluaX!\n\nEnvie despesas assim:\n<code>18,50 almoço restaurante</code>\n<code>750 renda pendente</code>");
  }

  const userId = get(`Telegram:${chatId}`);
  if (!userId) return t.reply(chatId, "👋 Este chat ainda não está ligado. No EvoluaX vá a Configurações → Registo rápido via Telegram, gere um código e envie-o aqui.");
  if (/^\/(start|ajuda|help)/i.test(text.trim())) {
    return t.reply(chatId, "Envie: <code>valor descrição</code>\nEx.: <code>18,50 almoço</code>\nAcrescente <code>pendente</code> para ficar por pagar (vai para a agenda).");
  }
  const exp = p.parseExpenseMessage(text);
  if (!exp) return t.reply(chatId, "🤔 Não percebi. Use: <code>valor descrição</code>, ex.: <code>18,50 almoço</code>");

  const isOwner = get("OwnerUserId") === userId;
  const sid = isOwner ? master : get(`Sheet:${userId}`);
  if (!sid) return t.reply(chatId, "⚠️ A sua folha ainda não existe. Entre uma vez no EvoluaX e tente de novo.");
  const all = await s.readAll(sid);
  const active = (v?: string) => !v || v.toUpperCase() === "TRUE";
  const account = all.Accounts.rows.map((r) => r.obj).find((a) => active(a.Active));
  if (!account) return t.reply(chatId, "⚠️ Ainda não tem contas. Crie uma conta no EvoluaX primeiro.");
  const cat = p.guessCategory(
    exp.description,
    all.Categories.rows.map((r) => r.obj).filter((c) => active(c.Active)) as never,
    all.Subcategories.rows.map((r) => r.obj).filter((c) => active(c.Active)) as never,
  );
  const today = todayLisbon();
  const tx = {
    TransactionId: `tg-${chatId}-${updateId}`, // idempotent on Telegram retries
    Type: "Despesa", Description: exp.description, Amount: exp.amount,
    TransactionDate: today, DueDate: exp.pending ? today : "",
    CategoryId: cat.CategoryId, SubcategoryId: cat.SubcategoryId, AccountId: account.AccountId!,
    PaymentMethod: "Outro", Status: exp.pending ? "Pendente" : "Pago", Nature: "Variável",
    Recurrence: "Não recorrente", Notes: "Registado via Telegram", TransferGroupId: "",
  };
  await s.upsert(sid, "Transactions", tx);
  if (isOwner && exp.pending) {
    try { await (await import("@/lib/calendar.server")).syncExpenseEvent(tx as never); } catch (e) { console.error("Calendar sync failed", e); }
  }
  const catName = all.Categories.rows.find((r) => r.obj.CategoryId === cat.CategoryId)?.obj.Name ?? "—";
  const subName = all.Subcategories.rows.find((r) => r.obj.SubcategoryId === cat.SubcategoryId)?.obj.Name;
  await t.reply(chatId, `✅ <b>Despesa registada</b>\n${exp.description}\n💶 ${fmtEUR(exp.amount)}\n🏷️ ${catName}${subName ? ` (${subName})` : ""}\n🏦 ${account.Name}\n📌 ${tx.Status}`);
}
