import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestExpenseConfirmation, confirmTelegramExpense } from "@/lib/expense-confirmation.server";
import * as sheets from "@/lib/sheets.server";
import * as telegram from "@/lib/telegram.server";

vi.mock("@/lib/sheets.server", () => ({ upsert: vi.fn(), readTable: vi.fn(), deleteWhere: vi.fn() }));
vi.mock("@/lib/telegram.server", () => ({ tg: vi.fn(), reply: vi.fn() }));
const tx = { TransactionId: "tg-123-456", Type: "Despesa", Description: "Fatura", Amount: 86.10, TransactionDate: "2026-11-10", Status: "Pago" };
beforeEach(() => vi.clearAllMocks());
const pending = (expiresAt = Date.now() + 900000, userId = "u1") => {
  vi.mocked(sheets.readTable).mockResolvedValue({ rows: [{ obj: { SettingKey: "TgPending:123:tg-123-456", SettingValue: JSON.stringify({ tx, userId, expiresAt }) } }] } as never);
};
describe("Telegram duplicate confirmation", () => {
  it("only saves a draft and asks confirmation for an expense on the same date", async () => {
    expect(await requestExpenseConfirmation("sheet1", 123, "u1", tx, [{ ...tx, TransactionId: "old", Amount: "86,10" }])).toBe(true);
    expect(sheets.upsert).toHaveBeenCalledTimes(1);
    expect(sheets.upsert).toHaveBeenCalledWith("sheet1", "Settings", expect.objectContaining({ SettingKey: "TgPending:123:tg-123-456" }));
    expect(telegram.tg).toHaveBeenCalledWith("sendMessage", expect.objectContaining({ reply_markup: expect.any(Object) }));
  });
  it("does not ask confirmation for another date", async () => {
    expect(await requestExpenseConfirmation("sheet1", 123, "u1", tx, [{ ...tx, TransactionId: "old", Amount: "86.10", TransactionDate: "2026-11-09" }])).toBe(false);
    expect(sheets.upsert).not.toHaveBeenCalled();
  });
  it("saves exactly the original expense when confirmed", async () => {
    pending();
    await confirmTelegramExpense("sheet1", 123, "u1", tx.TransactionId, false, false);
    expect(sheets.upsert).toHaveBeenCalledWith("sheet1", "Transactions", tx);
    expect(sheets.deleteWhere).toHaveBeenCalledWith("sheet1", "Settings", "SettingKey", ["TgPending:123:tg-123-456"]);
  });
  it("never registers a cancelled confirmation", async () => {
    pending();
    await confirmTelegramExpense("sheet1", 123, "u1", tx.TransactionId, true, false);
    expect(sheets.upsert).not.toHaveBeenCalled();
  });
  it("never registers an expired confirmation", async () => {
    pending(Date.now() - 1);
    await confirmTelegramExpense("sheet1", 123, "u1", tx.TransactionId, false, false);
    expect(sheets.upsert).not.toHaveBeenCalled();
  });
  it("does not allow another linked user to confirm the draft", async () => {
    pending(Date.now() + 900000, "another-user");
    await expect(confirmTelegramExpense("sheet1", 123, "u1", tx.TransactionId, false, false)).rejects.toThrow("Invalid confirmation owner");
    expect(sheets.upsert).not.toHaveBeenCalled();
  });
});