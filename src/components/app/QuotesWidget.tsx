import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/app/ui";
import { RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const fetchQuotes = async () => {
  const [fxRes, btcRes] = await Promise.all([
    fetch("https://api.frankfurter.dev/v1/latest?from=EUR&to=USD"),
    fetch("https://api.coinbase.com/v2/prices/BTC-EUR/spot"),
  ]);

  if (!fxRes.ok || !btcRes.ok) throw new Error("Failed to fetch quotes");

  const fxData = await fxRes.json();
  const btcData = await btcRes.json();

  const eurUsd = fxData.rates.USD;
  const btcEur = parseFloat(btcData.data.amount);

  return {
    eurUsd,
    usdEur: 1 / eurUsd,
    btcEur,
    date: fxData.date,
  };
};

export function QuotesWidget() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["quotes-widget"],
    queryFn: fetchQuotes,
    staleTime: 60 * 1000,
    refetchInterval: 300_000,
  });

  if (error) return null;

  return (
    <Panel 
      title="Cotações de Mercado" 
      action={
        <button 
          onClick={() => refetch()} 
          disabled={isFetching}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Atualizar"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </button>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-10 bg-muted/50 rounded-lg" />
            <div className="h-10 bg-muted/50 rounded-lg" />
            <div className="h-10 bg-muted/50 rounded-lg" />
          </div>
        ) : data ? (
          <>
            <QuoteItem 
              label="EUR/USD" 
              value={data.eurUsd.toFixed(4)} 
              sub="BCE Reference Rate"
            />
            <QuoteItem 
              label="USD/EUR" 
              value={data.usdEur.toFixed(4)} 
              sub="Inverse Rate"
            />
            <QuoteItem 
              label="BTC/EUR" 
              value={new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(data.btcEur)} 
              sub="Coinbase Spot"
              icon={<TrendingUp className="h-3 w-3 text-income" />}
            />
            <div className="text-[10px] text-muted-foreground flex justify-between items-center pt-2 border-t border-border/40">
              <span>Fonte: Frankfurter & Coinbase</span>
              <span>Ref: {data.date}</span>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function QuoteItem({ label, value, sub, icon }: { label: string; value: string; sub: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="space-y-0.5">
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-[10px] text-muted-foreground/60">{sub}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold tracking-tight">{value}</span>
        {icon}
      </div>
    </div>
  );
}
