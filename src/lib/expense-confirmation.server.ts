import { duplicateExpenses, expenseFromRow, fmtDate, fmtEUR } from "./finance";
import type { ExpenseCandidate } from "./finance";
import * as s from "./sheets.server";
import * as t from "./telegram.server";

type Draft = ExpenseCandidate & Record<string, string | number>;
const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Store an uncommitted draft in the caller's sheet, never in Transactions. */
export async function requestExpenseConfirmation(sid: string, chatId: number, userId: string, tx: Draft, rows: Record<string, string | undefined>[]) {
  const duplicates = duplicateExpenses(tx, rows.map(expenseFromRow));
  if (!duplicates.length) return false;
  await s.upsert(sid, "Settings", { SettingKey: `TgPending:${chatId}:${tx.TransactionId}`,
    SettingValue: JSON.stringify({ userId, expiresAt: Date.now() + 15 * 60_000, tx }) });
  await t.tg("sendMessage", { chat_id: chatId, parse_mode: "HTML",
    text: `⚠️ <b>Possível despesa duplicada</b>\nJá existe: ${escape(duplicates[0]?.Description ?? "Despesa")} — ${fmtEUR(Number(tx.Amount))} em ${fmtDate(tx.TransactionDate)}.\n\nNova despesa: ${escape(tx.Description)}\nNada foi registado. Deseja guardar mesmo assim? (15 minutos)`,
    reply_markup: { inline_keyboard: [[{ text: "Guardar mesmo assim", callback_data: `confirm:${tx.TransactionId}` }, { text: "Cancelar", callback_data: `cancel:${tx.TransactionId}` }]] },
  });
  return true;
}

export async function confirmTelegramExpense(sid: string, chatId: number, userId: string, txId: string, cancel: boolean, isOwner: boolean) {
  const key = `TgPending:${chatId}:${txId}`;
  const settings = await s.readTable(sid, "Settings");
  const raw = settings.rows.find((r) => r.obj.SettingKey === key)?.obj.SettingValue;
  if (!raw) { await t.reply(chatId, "Este pedido já foi tratado ou expirou."); return; }
  const draft = JSON.parse(raw) as { userId: string; expiresAt: number; tx: Draft };
  if (draft.userId !== userId || draft.tx.TransactionId !== txId) throw new Error("Invalid confirmation owner");
  if (cancel || draft.expiresAt < Date.now()) {
    await s.deleteWhere(sid, "Settings", "SettingKey", [key]);
    await t.reply(chatId, cancel ? "Cancelado. A despesa não foi registada." : "Confirmação expirada. Reenvie a despesa.");
    return;
  }
  await s.upsert(sid, "Transactions", draft.tx);
  if (isOwner && draft.tx.Status === "Pendente") {
    try { await (await import("./calendar.server")).syncExpenseEvent(draft.tx as never); }
    catch (e) { console.error("Calendar sync failed", e); }
  }
  await s.deleteWhere(sid, "Settings", "SettingKey", [key]);
  await t.reply(chatId, `✅ Despesa registada após confirmação: ${escape(draft.tx.Description)} — ${fmtEUR(Number(draft.tx.Amount))}.`);
}