import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold lg:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, className, action }: { title?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-card", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone, hint, icon }: { label: string; value: string; tone?: "income" | "expense" | "primary" | "warning"; hint?: ReactNode; icon?: ReactNode }) {
  const toneCls = { income: "bg-income-soft text-income", expense: "bg-expense-soft text-expense", primary: "bg-accent text-accent-foreground", warning: "bg-warning-soft text-warning" }[tone ?? "primary"];
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneCls)}>{icon}</span>}
      </div>
      <div className="tabular mt-3 font-display text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

const STATUS: Record<string, string> = {
  Pago: "bg-expense-soft text-expense", Recebido: "bg-income-soft text-income", Pendente: "bg-warning-soft text-warning", Cancelado: "bg-muted text-muted-foreground",
};
export function StatusBadge({ s }: { s: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS[s])}>{s}</span>;
}

export function Amount({ type, value, fmt }: { type: string; value: number; fmt: (n: number) => string }) {
  return (
    <span className={cn("tabular font-semibold", type === "Receita" ? "text-income" : type === "Despesa" ? "text-expense" : "text-muted-foreground")}>
      {type === "Receita" ? "+" : type === "Despesa" ? "−" : ""}{fmt(value)}
    </span>
  );
}
