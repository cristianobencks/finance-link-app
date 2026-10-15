import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMarketQuotes } from "@/lib/market-quotes.server";

afterEach(() => vi.unstubAllGlobals());

describe("read-only market quotes", () => {
  it("returns EUR/USD, its inverse and bitcoin priced in EUR", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ base: "EUR", date: "2026-10-15", rates: { USD: 1.25 } }))
      .mockResolvedValueOnce(Response.json({ data: { base: "BTC", currency: "EUR", amount: "60000.50" } }));
    vi.stubGlobal("fetch", fetcher);
    const data = await fetchMarketQuotes();
    expect(data.fx).toEqual({ eurUsd: 1.25, usdEur: 0.8, date: "2026-10-15" });
    expect(data.bitcoin?.eur).toBe(60000.5);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps bitcoin available when the currency source is offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ data: { base: "BTC", currency: "EUR", amount: "60000" } })));
    const data = await fetchMarketQuotes();
    expect(data.fx).toBeNull();
    expect(data.bitcoin?.eur).toBe(60000);
  });
  it("never displays invalid or zero quotes as real prices", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ base: "EUR", date: "2026-10-15", rates: { USD: 0 } }))
      .mockResolvedValueOnce(Response.json({ data: { base: "BTC", currency: "EUR", amount: "invalid" } })));
    expect(await fetchMarketQuotes()).toEqual({ fx: null, bitcoin: null });
  });
});