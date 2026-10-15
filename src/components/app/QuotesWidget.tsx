import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/app/ui";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
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
    queryKey: ["quotes"],
    queryFn: fetchQuotes,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000,
  });

  if (error) return null;

  return (
    <Panel 
      title="Cotações" 
      action={
        <button 
          onClick={() => refetch()} 
          disabled={isFetching}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
        </button>
      }
    >
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        ) : data ? (
          <>
            <QuoteItem 
              label="EUR/USD" 
              value={data.eurUsd.toFixed(4)} 
              subValue="Câmbio BCE" 
            />
            <QuoteItem 
              label="USD/EUR" 
              value={data.usdEur.toFixed(4)} 
              subValue="Inverso" 
            />
            <QuoteItem 
              label="BTC/EUR" 
              value={new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(data.btcEur)} 
              subValue="Coinbase Spot" 
              icon={<TrendingUp className="h-3 w-3 text-income" />}
            />
            <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
              FX Ref: {data.date}
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function QuoteItem({ label, value, subValue, icon }: { label: string; value: string; subValueTextText?: string; subValue?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs font-medium text-muted-foreground uppercase">{label}</div>
        <div className="text-[10px] text-muted-foreground/60">{subValue}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm font-semibold">{value}</span>
        {icon}
      </div>
    </div>
  );
}
