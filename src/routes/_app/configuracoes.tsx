import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Tags, Landmark, CreditCard } from "lucide-react";
import { useFinanceQuery } from "@/hooks/use-finance";
import { PageHeader, Panel } from "@/components/app/ui";
import { SetupPanel } from "@/components/app/SetupPanel";
import { Button } from "@/components/ui/button";
import { SHEETS } from "@/lib/schema";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { getAllowedEmails, saveAllowedEmails, createTelegramCode, getTelegramStatus, unlinkTelegram } from "@/lib/finance.functions";

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Meu Controle Financeiro" }, { name: "description", content: "Ligação ao Google Sheets e estrutura da folha de cálculo." }, { property: "og:title", content: "Configurações" }, { property: "og:description", content: "Ligação ao Google Sheets e estrutura da folha." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const q = useFinanceQuery();
  const d = q.data?.ok ? q.data.data : null;
  return (
    <>
      <PageHeader title="Configurações" subtitle="Formato regional: Português (Portugal) · EUR (€) · DD/MM/AAAA · Europe/Lisbon" />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {([["/categorias", "Categorias", Tags], ["/contas", "Contas", Landmark], ["/metodos-pagamento", "Métodos de pagamento", CreditCard]] as const).map(([to, label, Icon]) => (
          <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm font-medium shadow-card hover:border-primary"><Icon className="h-5 w-5 text-primary" />{label}</Link>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Google Sheets">
          <p className="text-sm text-muted-foreground">Estado: <span className="font-medium text-income">Ligado</span> · {d?.transactions.length ?? 0} movimentações, {d?.categories.length ?? 0} categorias, {d?.accounts.length ?? 0} contas.</p>
          {d && d.spreadsheetUrl && <Button asChild variant="outline" className="mt-4"><a href={d.spreadsheetUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir folha de cálculo</a></Button>}
        </Panel>
        <SetupPanel />
        <TelegramPanel />
        {d?.isOwner && <AccessPanel />}
        <Panel title="Estrutura esperada" className="xl:col-span-2">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(SHEETS).map(([tab, cols]) => (
              <div key={tab} className="rounded-xl bg-muted p-3"><p className="text-sm font-semibold">{tab}</p><p className="mt-1 break-words font-mono text-xs text-muted-foreground">{cols.join(", ")}</p></div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function AccessPanel() {
  const load = useServerFn(getAllowedEmails);
  const save = useServerFn(saveAllowedEmails);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    load().then((r) => r.ok && setText(r.data.join("\n")));
  }, [load]);
  async function onSave() {
    const emails = text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    setBusy(true);
    try {
      const r = await save({ data: { emails } });
      if (r.ok) toast.success("Lista de acessos guardada.");
      else toast.error(r.error);
    } catch {
      toast.error("Há emails inválidos na lista. Nada foi guardado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Utilizadores autorizados" className="xl:col-span-2">
      <p className="text-sm text-muted-foreground">Um email por linha. Cada pessoa autorizada recebe a sua própria folha de cálculo, separada da sua, criada na primeira entrada. Os restantes são bloqueados.</p>
      <Textarea className="mt-3 min-h-28 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="pessoa@gmail.com" />
      <Button className="mt-3" onClick={onSave} disabled={busy}>{busy ? "A guardar…" : "Guardar acessos"}</Button>
    </Panel>
  );
}

function TelegramPanel() {
  const gen = useServerFn(createTelegramCode);
  const status = useServerFn(getTelegramStatus);
  const unlink = useServerFn(unlinkTelegram);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: number; bot: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => status().then((r) => r.ok && setLinked(r.data.linked)).catch(() => {});
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!code || linked) return;
    const i = setInterval(refresh, 5000);
    return () => clearInterval(i);
  }, [code, linked]);
  async function onGen() {
    setBusy(true);
    try {
      const r = await gen();
      if (r.ok) setCode(r.data); else toast.error(r.error);
    } catch { toast.error("Falha de comunicação. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function onUnlink() {
    setBusy(true);
    try {
      const r = await unlink();
      if (r.ok) { setLinked(false); setCode(null); toast.success("Telegram desligado."); } else toast.error(r.error);
    } finally { setBusy(false); }
  }
  const expiry = code ? new Date(code.expiresAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }) : "";
  return (
    <Panel title="Registo rápido via Telegram" className="xl:col-span-2">
      <p className="text-sm text-muted-foreground">
        Estado: {linked === null ? "a verificar…" : linked ? <span className="font-medium text-income">Ligado</span> : <span className="font-medium">Não ligado</span>}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">Depois de ligado, envie ao bot mensagens como <code className="rounded bg-muted px-1">18,50 almoço</code> ou <code className="rounded bg-muted px-1">750 renda pendente</code>. A despesa vai para a sua folha, na primeira conta ativa, com a categoria adivinhada pela descrição.</p>
      {code && !linked && (
        <div className="mt-4 rounded-xl bg-muted p-4">
          <p className="text-sm">O seu código (válido até {expiry}):</p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-widest">{code.code.slice(0, 3)} {code.code.slice(3)}</p>
          <Button asChild className="mt-3"><a href={`https://t.me/${code.bot}?start=${code.code}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir @{code.bot} no Telegram</a></Button>
          <p className="mt-2 text-xs text-muted-foreground">Ou envie o código diretamente ao bot @{code.bot}.</p>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {!linked && <Button onClick={onGen} disabled={busy}>{code ? "Gerar novo código" : "Gerar código de ligação"}</Button>}
        {linked && <Button variant="outline" onClick={onUnlink} disabled={busy}>Desligar Telegram</Button>}
      </div>
    </Panel>
  );
}
