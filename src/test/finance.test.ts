import { describe, expect, it } from "vitest";
import { accountBalance, monthSummary, budgetSpent, duplicateExpenses } from "@/lib/finance";
import type { Account, Transaction } from "@/lib/schema";

const tx = (p: Partial<Transaction>): Transaction => ({
  TransactionId: Math.random().toString(), Type: "Despesa", Description: "teste", Amount: 0, TransactionDate: "2026-10-05",
  DueDate: "", CategoryId: "c1", SubcategoryId: "", AccountId: "a1", PaymentMethod: "", Status: "Pago", Nature: "Variável",
  Recurrence: "Não recorrente", Notes: "", CreatedAt: "", UpdatedAt: "", TransferGroupId: "", ...p,
});
const acc = (id: string, opening: number): Account => ({ AccountId: id, Name: id, AccountType: "Conta bancária", Institution: "", OpeningBalance: opening, OpeningDate: "2026-01-01", Currency: "EUR", Active: true, CreatedAt: "", UpdatedAt: "" });

const data = [
  tx({ Type: "Receita", Amount: 2000, Status: "Recebido" }),
  tx({ Type: "Despesa", Amount: 500, Status: "Pago" }),
  tx({ Type: "Despesa", Amount: 300, Status: "Pendente" }),
  tx({ Type: "Receita", Amount: 100, Status: "Pendente" }),
  tx({ Type: "Despesa", Amount: 999, Status: "Cancelado" }),
  tx({ Type: "Transferência", Amount: 400, Status: "Pago", AccountId: "a1", TransferGroupId: "g" }),
  tx({ Type: "Transferência", Amount: 400, Status: "Recebido", AccountId: "a2", TransferGroupId: "g" }),
];

describe("finance rules", () => {
  it("flags the same amount on the same date even with a different description or account", () => {
    const candidate = tx({ TransactionId: "new", Amount: 86.10, TransactionDate: "2026-11-10" });
    expect(duplicateExpenses(candidate, [tx({ TransactionId: "old", Amount: 86.1, TransactionDate: "2026-11-10", Description: "Outra descrição", AccountId: "a2" })]).map((t) => t.TransactionId)).toEqual(["old"]);
  });
  it("never flags expenses from another date", () => {
    expect(duplicateExpenses(tx({ Amount: 86.10, TransactionDate: "2026-11-10" }), [tx({ Amount: 86.10, TransactionDate: "2026-11-09" }), tx({ Amount: 86.10, TransactionDate: "2026-11-11" })])).toEqual([]);
  });
  it("does not flag different amounts, income, transfers, cancelled expenses or itself", () => {
    const candidate = tx({ TransactionId: "same", Amount: 86.10 });
    expect(duplicateExpenses(candidate, [candidate, tx({ Amount: 86.11 }), tx({ Type: "Receita", Amount: 86.10 }), tx({ Type: "Transferência", Amount: 86.10 }), tx({ Status: "Cancelado", Amount: 86.10 })])).toEqual([]);
    expect(duplicateExpenses({ ...candidate, Type: "Receita" }, [tx({ Amount: 86.10 })])).toEqual([]);
  });
  it("monthly result counts only settled income minus settled expenses", () => {
    const s = monthSummary(data, "2026-10");
    expect(s.income).toBe(2000);
    expect(s.expense).toBe(500);
    expect(s.result).toBe(1500);
  });
  it("pending amounts are reported separately", () => {
    const s = monthSummary(data, "2026-10");
    expect(s.pendingExpense).toBe(300);
    expect(s.pendingIncome).toBe(100);
  });
  it("savings rate is null without received income", () => {
    expect(monthSummary([tx({ Amount: 10 })], "2026-10").savingsRate).toBeNull();
    expect(monthSummary(data, "2026-10").savingsRate).toBe(0.75);
  });
  it("transfers move balances but not income/expense", () => {
    expect(accountBalance(acc("a1", 1000), data)).toBe(1000 + 2000 - 500 - 400);
    expect(accountBalance(acc("a2", 0), data)).toBe(400);
  });
  it("budget spent uses only paid expenses of that category and month", () => {
    expect(budgetSpent({ BudgetId: "b", YearMonth: "2026-10", CategoryId: "c1", BudgetAmount: 600, Notes: "", CreatedAt: "", UpdatedAt: "" }, data)).toBe(500);
  });
});
