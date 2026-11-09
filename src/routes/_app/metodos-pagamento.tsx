import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { demo } from "@/lib/demo";
import { useFinance, useMutate } from "@/hooks/use-finance";
import { saveSetting } from "@/lib/finance.functions";
import { PageHeader, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { paymentMethods } from "@/lib/schema";

export const Route = createFileRoute("/_app/metodos-pagamento")({
  head: () => ({ meta: [{ title: "Métodos de pagamento — EvoluaX" }, { name: "description", content: "Gerir as opções de método de pagamento das movimentações." }, { property: "og:title", content: "Métodos de pagamento — EvoluaX" }, { property: "og:description", content: "Gerir as opções de método de pagamento." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Methods,
});

function Methods() {
  const d = useFinance();
  const save = useMutate(useServerFn(saveSetting), demo.saveSetting);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ i: number; v: string } | null>(null);
  const [err, setErr] = useState("");
  if (!d) return null;
  const list = paymentMethods(d.settings);

  async function persist(next: string[]) {
    return save.run({ SettingKey: "PaymentMethods", SettingValue: next.join("\n") }, "Métodos de pagamento guardados no Google Sheets");
  }
  const dup = (v: string, skip = -1) => list.some((m, i) => i !== skip && m.toLowerCase() === v.toLowerCase());
  async function add() {
    const v = name.trim();
    if (!v) return setErr("Indique o nome.");
    if (dup(v)) return setErr("Esse método já existe.");
    setErr("");
    if (await persist([...list, v])) setName("");
  }
  async function rename() {
    if (!edit) return;
    const v = edit.v.trim();
    if (!v) return setErr("Indique o nome.");
    if (dup(v, edit.i)) return setErr("Esse método já existe.");
    setErr("");
    if (await persist(list.map((m, i) => (i === edit.i ? v : m)))) setEdit(null);
  }

  return (
    <>
      <PageHeader title="Métodos de pagamento" subtitle="Opções disponíveis no campo Método de pagamento das movimentações." />
      <Panel className="max-w-2xl">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input placeholder="Novo método (ex.: Revolut)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Button type="submit" disabled={save.pending}><Plus className="h-4 w-4" />Adicionar</Button>
        </form>
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
        <ul className="mt-4 divide-y">
          {list.map((m, i) => (
            <li key={m} className="flex items-center gap-2 py-2.5">
              {edit?.i === i ? (
                <>
                  <Input value={edit.v} onChange={(e) => setEdit({ i, v: e.target.value })} maxLength={60} autoFocus />
                  <Button size="icon" variant="ghost" aria-label="Guardar" onClick={rename} disabled={save.pending}><Check className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEdit(null)}><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{m}</span>
                  <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEdit({ i, v: m })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Remover" disabled={save.pending} onClick={() => persist(list.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-expense" /></Button>
                </>
              )}
            </li>
          ))}
          {!list.length && <li className="py-3 text-sm text-muted-foreground">Sem métodos. Adicione o primeiro acima.</li>}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Remover um método não altera as movimentações já gravadas.</p>
      </Panel>
    </>
  );
}
