// Pure helpers for the Telegram bot (no I/O) — tested in src/test/telegram.test.ts.

export type ParsedExpense = { amount: number; description: string; pending: boolean };

/** "18,50 almoço restaurante" | "almoço 18.50 pendente" → expense. Returns null if no amount/description. */
export function parseExpenseMessage(text: string): ParsedExpense | null {
  const t = text.trim();
  const m = t.match(/(?:^|\s)€?\s*(\d{1,9}(?:[.,]\d{1,2})?)\s*(?:€|eur|euros?)?(?=\s|$)/i);
  if (!m) return null;
  const amount = Number((m[1] ?? "").replace(",", "."));
  if (!(amount > 0)) return null;
  let rest = (t.slice(0, m.index) + " " + t.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim();
  const pending = /\bpendente\b/i.test(rest);
  rest = rest.replace(/\bpendente\b/gi, "").replace(/\s+/g, " ").trim();
  if (!rest) return null;
  return { amount, description: rest.slice(0, 200), pending };
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Picks the subcategory/category whose name appears in the description; falls back to "Outros". */
export function guessCategory(
  description: string,
  categories: { CategoryId: string; Name: string; Type: string }[],
  subcategories: { SubcategoryId: string; CategoryId: string; Name: string }[],
) {
  const d = norm(description);
  const exp = new Set(categories.filter((c) => c.Type === "Despesa").map((c) => c.CategoryId));
  const words = (n: string) => norm(n).split(/\s+/).filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(4, w.length - 2)));
  const sub = subcategories.find((s) => exp.has(s.CategoryId) && words(s.Name).some((w) => d.includes(w)));
  if (sub) return { CategoryId: sub.CategoryId, SubcategoryId: sub.SubcategoryId };
  const cat = categories.find((c) => exp.has(c.CategoryId) && words(c.Name).some((w) => d.includes(w)));
  if (cat) return { CategoryId: cat.CategoryId, SubcategoryId: "" };
  const other = categories.find((c) => exp.has(c.CategoryId) && norm(c.Name) === "outros") ?? categories.find((c) => exp.has(c.CategoryId));
  return { CategoryId: other?.CategoryId ?? "", SubcategoryId: "" };
}

/** "/start 123456", "123456" or "123 456" → "123456". */
export function extractLinkCode(text: string): string | null {
  const m = text.trim().match(/^(?:\/start\s+)?(\d{3})\s?(\d{3})$/);
  return m ? `${m[1]}${m[2]}` : null;
}
