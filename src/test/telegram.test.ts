import { describe, expect, it } from "vitest";
import { parseExpenseMessage, guessCategory, extractLinkCode } from "@/lib/telegram";

describe("telegram parsing", () => {
  it("reads amount with comma and description", () => {
    expect(parseExpenseMessage("18,50 almoço restaurante")).toEqual({ amount: 18.5, description: "almoço restaurante", pending: false });
  });
  it("marks pendente and strips it from description", () => {
    expect(parseExpenseMessage("Renda 750 pendente")).toEqual({ amount: 750, description: "Renda", pending: true });
  });
  it("rejects message without amount", () => {
    expect(parseExpenseMessage("almoço")).toBeNull();
  });
  it("extracts 6-digit link code", () => {
    expect(extractLinkCode("/start 849201")).toBe("849201");
    expect(extractLinkCode("849 201")).toBe("849201");
    expect(extractLinkCode("18 almoço")).toBeNull();
  });
  it("guesses category from subcategory name, else Outros", () => {
    const cats = [{ CategoryId: "cat-d-alimentacao", Name: "Alimentação", Type: "Despesa" }, { CategoryId: "cat-d-outros", Name: "Outros", Type: "Despesa" }];
    const subs = [{ SubcategoryId: "cat-d-alimentacao-supermercado", CategoryId: "cat-d-alimentacao", Name: "Supermercado" }];
    expect(guessCategory("compras supermercado", cats, subs)).toEqual({ CategoryId: "cat-d-alimentacao", SubcategoryId: "cat-d-alimentacao-supermercado" });
    expect(guessCategory("presente", cats, subs)).toEqual({ CategoryId: "cat-d-outros", SubcategoryId: "" });
  });
});
