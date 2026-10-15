import { createServerFn } from "@tanstack/react-start";

// Public, read-only market data; no account data or connector credentials.
export const getMarketQuotes = createServerFn({ method: "GET" }).handler(async () => {
  const { readMarketQuotes } = await import("./market-quotes.server");
  return readMarketQuotes();
});