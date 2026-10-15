import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bitcoin, DollarSign, Euro } from "lucide-react";
import { getMarketQuotes } from "@/lib/market-quotes.functions";
import { fmtDate, fmtEUR } from "@/lib/finance";

const usd = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const time = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });

export function MarketQuotes() {
  const getQuotes = useServerFn(getMarketQuotes);
  const q = useQuery({ queryKey: ["market-quotes"], queryFn: () => getQuotes(), staleTime: 60_000, refetchInterval: 300_000, retry: 1 });
  const fx = q.data?.fx;
  const btc = q.data?.bitcoin;
  const unavailable = q.isPending ? "A carregar…" : "Indisponível";
  const rates = [
    { name: "Euro", pair: "1 EUR → USD", icon: Euro, value: fx ? usd.format(fx.eurUsd) : null, note: fx ? `BCE · ${fmtDate(fx.date)}` : "BCE / Frankfurter", tone: "bg-accent text-accent-foreground" },
    { name: "Dólar americano", pair: "1 USD → EUR", icon: DollarSign, value: fx ? eur.format(fx.usdEur) : null, note: fx ? `BCE · ${fmtDate(fx.date)}` : "BCE / Frankfurter", tone: "bg-income-soft text-income" },
    { name: "Bitcoin", pair: "1 BTC → EUR", icon: Bitcoin, value: btc ? fmtEUR(btc.eur) : null, note: btc ? `Coinbase · ${fmtDate(btc.fetchedAt)} ${time.format(new Date(btc.fetchedAt))} (Lisboa)` : "Coinbase", tone: "bg-warning-soft text-warning" },
  ];

  return (
    <section aria-label="Cotações de moedas" className="mb-6 border-y py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground">Cotações</h2>
        <span className="text-[11px] text-muted-foreground">Câmbio diário · Bitcoin a cada 5 min</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 sm:gap-0">
        {rates.map((rate, i) => (
          <div key={rate.name} className={`flex min-w-0 items-start gap-3 ${i > 0 ? "sm:border-l sm:pl-5" : ""} sm:pr-3`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${rate.tone}`}><rate.icon className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2"><h3 className="text-xs font-semibold">{rate.name}</h3><span className="text-[10px] text-muted-foreground">{rate.pair}</span></div>
              <p className="tabular min-h-7 text-lg font-semibold" aria-live="polite">{rate.value ?? <span className="text-sm font-normal text-muted-foreground">{unavailable}</span>}</p>
              <p className="text-[10px] text-muted-foreground">{rate.note}{q.isError && rate.value ? " · Sem atualização" : ""}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}