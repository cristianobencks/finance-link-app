import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const updateSchema = z.object({
  update_id: z.number(),
  callback_query: z.object({ id: z.string(), data: z.string().max(64), message: z.object({ chat: z.object({ id: z.number() }) }) }).optional(),
  message: z.object({ chat: z.object({ id: z.number() }), text: z.string().max(1000).optional(),
    caption: z.string().max(1000).optional(),
    photo: z.array(z.object({ file_id: z.string(), file_size: z.number().optional() })).optional(),
    document: z.object({ file_id: z.string(), mime_type: z.string().optional(), file_size: z.number().optional() }).optional(),
  }).passthrough().optional(),
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
        if (parsed.success && parsed.data.callback_query) {
          const cb = parsed.data.callback_query;
          await t.tg("answerCallbackQuery", { callback_query_id: cb.id });
          if (/^(confirm|cancel):tg-[-\d]+$/.test(cb.data)) {
            try { await handle(parsed.data.update_id, cb.message.chat.id, `/${cb.data.replace(":", " ")}`); }
            catch (e) { console.error("Telegram confirmation failed", e); await t.reply(cb.message.chat.id, "Não consegui concluir a confirmação. Tente novamente."); }
          }
          return Response.json({ ok: true });
        }
        const msg = parsed.success ? parsed.data.message : undefined;
        if (!parsed.success || !msg) return Response.json({ ok: true });
        const chatId = msg.chat.id;
        const photo = msg.photo?.at(-1);
        const file = photo ? { id: photo.file_id, mime: "image/jpeg", size: photo.file_size ?? 0 }
          : msg.document ? { id: msg.document.file_id, mime: msg.document.mime_type ?? "", size: msg.document.file_size ?? 0 } : undefined;
        if (!msg.text && !file) return Response.json({ ok: true });
        try {
          await handle(parsed.data.update_id, chatId, msg.text ?? msg.caption ?? "", file);
        } catch (e) {
          console.error("telegram handle failed", e instanceof Error ? e.message : e);
          await t.reply(chatId, "❌ Não foi possível gravar agora (a folha não respondeu). Nada foi registado. Tente novamente daqui a pouco.");
        }
        return Response.json({ ok: true });
      },
    },
  },
});

type TgFile = { id: string; mime: string; size: number };
async function handle(updateId: number, chatId: number, text: string, file?: TgFile) {
  const t = await import("@/lib/telegram.server");
  const p = await import("@/lib/telegram");
  const s = await import("@/lib/sheets.server");
  const { fmtEUR, todayLisbon } = await import("@/lib/finance");
  const master = s.masterSpreadsheetId();
  const settings = await s.readTable(master, "Settings");
  const get = (k: string) => settings.rows.find((r) => r.obj.SettingKey === k)?.obj.SettingValue ?? "";

  const code = file ? null : p.extractLinkCode(text);
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
  const confirmation = /^\/(confirm|cancel) (tg-[-\d]+)$/.exec(text.trim());
  if (confirmation) {
    const isOwner = get("OwnerUserId") === userId;
    const sid = isOwner ? master : get(`Sheet:${userId}`);
    const txId = confirmation[2];
    if (!sid || !txId) return t.reply(chatId, "A sua folha não está disponível.");
    return (await import("@/lib/expense-confirmation.server")).confirmTelegramExpense(sid, chatId, userId, txId, confirmation[1] === "cancel", isOwner);
  }
  if (/^\/(start|ajuda|help)/i.test(text.trim())) {
    return t.reply(chatId, "Envie: <code>valor descrição</code>\nEx.: <code>18,50 almoço</code>\nAcrescente <code>pendente</code> para ficar por pagar (vai para a agenda).");
  }
  if (file) return handleFile(updateId, chatId, userId, text, file, get);
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
  if (await (await import("@/lib/expense-confirmation.server")).requestExpenseConfirmation(sid, chatId, userId, tx, all.Transactions.rows.map((r) => r.obj))) return;
  await s.upsert(sid, "Transactions", tx);
  if (isOwner && exp.pending) {
    try { await (await import("@/lib/calendar.server")).syncExpenseEvent(tx as never); } catch (e) { console.error("Calendar sync failed", e); }
  }
  const catName = all.Categories.rows.find((r) => r.obj.CategoryId === cat.CategoryId)?.obj.Name ?? "—";
  const subName = all.Subcategories.rows.find((r) => r.obj.SubcategoryId === cat.SubcategoryId)?.obj.Name;
  await t.reply(chatId, `✅ <b>Despesa registada</b>\n${exp.description}\n💶 ${fmtEUR(exp.amount)}\n🏷️ ${catName}${subName ? ` (${subName})` : ""}\n🏦 ${account.Name}\n📌 ${tx.Status}`);
}

async function handleFile(updateId: number, chatId: number, userId: string, caption: string, file: TgFile, get: (k: string) => string) {
  const t = await import("@/lib/telegram.server");
  const s = await import("@/lib/sheets.server");
  const ai = await import("@/lib/receipt-ai.server");
  const { fmtEUR, fmtDate, todayLisbon } = await import("@/lib/finance");
  if (!/^(image\/|application\/pdf$)/.test(file.mime)) return t.reply(chatId, "📎 Envie uma foto ou um PDF do talão/fatura.");
  if (file.size > 8 * 1024 * 1024) return t.reply(chatId, "⚠️ Ficheiro demasiado grande (máx. 8 MB).");
  const isOwner = get("OwnerUserId") === userId;
  const sid = isOwner ? s.masterSpreadsheetId() : get(`Sheet:${userId}`);
  if (!sid) return t.reply(chatId, "⚠️ A sua folha ainda não existe. Entre uma vez no EvoluaX e tente de novo.");
  await t.tg("sendChatAction", { chat_id: chatId, action: "typing" });
  let base64: string, all: Awaited<ReturnType<typeof s.readAll>>;
  try { [base64, all] = await Promise.all([t.downloadFile(file.id), s.readAll(sid)]); }
  catch (e) {
    if (e instanceof t.FileMismatchError) return t.reply(chatId, "⚠️ Não consegui descarregar a sua foto corretamente. Nada foi registado. Tente novamente daqui a pouco.");
    throw e;
  }
  const active = (v?: string) => !v || v.toUpperCase() === "TRUE";
  const account = all.Accounts.rows.map((r) => r.obj).find((a) => active(a.Active));
  if (!account) return t.reply(chatId, "⚠️ Ainda não tem contas. Crie uma conta no EvoluaX primeiro.");
  const cats = all.Categories.rows.map((r) => r.obj).filter((c) => active(c.Active) && (c.Type ?? "Despesa") === "Despesa").map((c) => ({ id: c.CategoryId!, name: c.Name! }));
  const subs = all.Subcategories.rows.map((r) => r.obj).filter((c) => active(c.Active)).map((c) => ({ id: c.SubcategoryId!, name: c.Name!, categoryId: c.CategoryId! }));
  let data;
  try { data = await ai.readReceipt(file.mime, base64, cats, subs); }
  catch (e) { console.error("receipt AI failed", e); return t.reply(chatId, "❌ Não consegui ler o documento agora. Nada foi registado. Tente novamente ou escreva <code>valor descrição</code>."); }
  if (!data) return t.reply(chatId, "🤔 Não encontrei um talão/fatura com valor nesta imagem. Nada foi registado.");
  const pending = /\bpendente\b/i.test(caption);
  const today = todayLisbon();
  const ext = file.mime === "application/pdf" ? "pdf" : file.mime.split("/")[1]!.replace("jpeg", "jpg");
  const stamp = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (k: string) => stamp.find((x) => x.type === k)?.value ?? "";
  let attachment = "";
  try { attachment = await ai.saveToDrive(`despesa-${g("year")}-${g("month")}-${g("day")}-${g("hour")}${g("minute")}${g("second")}.${ext}`, file.mime, base64, userId); }
  catch (e) { console.error("Drive save failed", e); }
  const date = data.date && data.date <= today ? data.date : today;
  const tx = {
    TransactionId: `tg-${chatId}-${updateId}`,
    Type: "Despesa", Description: data.description, Amount: data.amount,
    TransactionDate: date, DueDate: pending ? date : "",
    CategoryId: data.categoryId, SubcategoryId: data.subcategoryId, AccountId: account.AccountId!,
    PaymentMethod: "Outro", Status: pending ? "Pendente" : "Pago", Nature: "Variável",
    Recurrence: "Não recorrente", Notes: "Lido de documento via Telegram", TransferGroupId: "", Attachment: attachment,
  };
  if (await (await import("@/lib/expense-confirmation.server")).requestExpenseConfirmation(sid, chatId, userId, tx, all.Transactions.rows.map((r) => r.obj))) return;
  await s.upsert(sid, "Transactions", tx);
  if (isOwner && pending) {
    try { await (await import("@/lib/calendar.server")).syncExpenseEvent(tx as never); } catch (e) { console.error("Calendar sync failed", e); }
  }
  const catName = cats.find((c) => c.id === data.categoryId)?.name ?? "—";
  const subName = subs.find((c) => c.id === data.subcategoryId)?.name;
  await t.reply(chatId, `✅ <b>Despesa registada a partir do documento</b>\n${data.description}\n💶 ${fmtEUR(data.amount)}\n📅 ${fmtDate(date)}\n🏷️ ${catName}${subName ? ` (${subName})` : ""}\n🏦 ${account.Name}\n📌 ${tx.Status}${attachment ? "\n📎 Foto guardada" : ""}\n\nSe algo estiver errado, corrija em Movimentações no EvoluaX.`);
}
