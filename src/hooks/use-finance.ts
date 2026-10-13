import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getFinanceData } from "@/lib/finance.functions";

export const FINANCE_KEY = ["finance"];

export function useFinanceQuery() {
  const fn = useServerFn(getFinanceData);
  return useQuery({ queryKey: FINANCE_KEY, queryFn: () => fn(), staleTime: 15_000, retry: 1, refetchOnWindowFocus: true, refetchInterval: 60_000 });
}

/** Returns loaded data (only valid when the sheet answered OK). */
export function useFinance() {
  const q = useFinanceQuery();
  const r = q.data;
  return r && r.ok ? r.data : null;
}

type Res = { ok: boolean; error?: string };

/**
 * Calls a server mutation, waits for the backend confirmation, then refreshes data.
 * Blocks double submissions while one is in flight. Never reports success on failure.
 */
export function useMutate<I>(fn: (args: { data: I }) => Promise<Res>) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = async (data: I, successMsg: string) => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    try {
      const r = await fn({ data });
      if (!r.ok) {
        toast.error("Não foi guardado", { description: r.error });
        return false;
      }
      toast.success(successMsg);
      await qc.refetchQueries({ queryKey: FINANCE_KEY, type: "all" });
      return true;
    } catch (e) {
      const msg = e instanceof Error && e.message.includes("Unauthorized") ? "Sessão expirada. Inicie sessão novamente." : "Falha de comunicação. Os dados não foram guardados — tente novamente.";
      toast.error("Não foi guardado", { description: msg });
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { run, pending };
}
