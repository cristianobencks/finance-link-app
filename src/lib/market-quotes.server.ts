import { z } from "zod";

const fxSchema = z.object({ base: z.literal("EUR"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), rates: z.object({ USD: z.number().positive().finite() }) });
const btcSchema = z.object({ data: z.object({ base: z.literal("BTC"), currency: z.literal("EUR"), amount: z.string().transform(Number).pipe(z.number().positive().finite()) }) });

async function read(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.text();
    console.error(`Market quotes failed [${response.status}]: ${body}`);
    throw new Error("Cotação indisponível");
  }
  return response.json();
}

export async function fetchMarketQuotes() {
  const [fx, btc] = await Promise.allSettled([
    read("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD").then((data) => fxSchema.parse(data)),
    read("https://api.coinbase.com/v2/prices/BTC-EUR/spot").then((data) => btcSchema.parse(data)),
  ]);
  return {
    fx: fx.status === "fulfilled" ? { eurUsd: fx.value.rates.USD, usdEur: 1 / fx.value.rates.USD, date: fx.value.date } : null,
    bitcoin: btc.status === "fulfilled" ? { eur: btc.value.data.amount, fetchedAt: new Date().toISOString() } : null,
  };
}

let cached: { data: Awaited<ReturnType<typeof fetchMarketQuotes>>; expires: number } | undefined;
let pending: Promise<Awaited<ReturnType<typeof fetchMarketQuotes>>> | undefined;

export async function readMarketQuotes() {
  if (cached && cached.expires > Date.now()) return cached.data;
  if (pending) return pending;
  pending = fetchMarketQuotes().then((data) => {
    cached = { data, expires: Date.now() + 60_000 };
    return data;
  });
  try { return await pending; }
  finally { pending = undefined; }
}