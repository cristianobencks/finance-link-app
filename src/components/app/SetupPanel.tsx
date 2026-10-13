import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { initializeSpreadsheet } from "@/lib/finance.functions";
import { FINANCE_KEY } from "@/hooks/use-finance";

export function SetupPanel({ error, code }: { error?: string; code?: number }) {
  const init = useServerFn(initializeSpreadsheet);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await init();
      if (!r.ok) return toast.error("Configuração falhou", { description: r.error });
      toast.success("Folha de cálculo pronta", { description: `${r.data.seededCategories} categorias e ${r.data.seededSubcategories} subcategorias criadas.` });
      await qc.invalidateQueries({ queryKey: FINANCE_KEY });
    } catch {
      toast.error("Falha de comunicação. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 shadow-card">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-warning-soft text-warning">
        {code === 403 ? <AlertTriangle className="h-5 w-5" /> : <Sheet className="h-5 w-5" />}
      </div>
      <h2 className="text-xl font-semibold">{code === 403 ? "Sem acesso" : "Ligação ao Google Sheets"}</h2>
      {error && <p className="mt-2 text-sm text-muted-foreground">{error}</p>}
      {code !== 403 && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            A configuração inicial cria as abas e cabeçalhos em falta e adiciona as categorias iniciais. Os dados existentes nunca são apagados e pode repetir sem criar duplicados.
          </p>
          <div className="mt-6 flex gap-2">
            <Button onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Executar configuração inicial</Button>
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: FINANCE_KEY })}>Tentar novamente</Button>
          </div>
        </>
      )}
    </div>
  );
}
