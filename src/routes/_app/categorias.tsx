import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useFinance, useMutate } from "@/hooks/use-finance";
import { saveCategory, saveSubcategory } from "@/lib/finance.functions";
import { PageHeader, Panel, Empty } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { newId } from "@/lib/finance";
import type { Category, Subcategory } from "@/lib/schema";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/categorias")({
  head: () => ({ meta: [{ title: "Categorias — Meu Controle Financeiro" }, { name: "description", content: "Gerir categorias e subcategorias de receitas e despesas." }, { property: "og:title", content: "Categorias" }, { property: "og:description", content: "Gerir categorias e subcategorias." }] }),
  component: Cats,
});

const ICONS = ["Tag", "Home", "UtensilsCrossed", "Car", "HeartPulse", "Users", "Plane", "Briefcase", "Landmark", "Lightbulb", "Store", "TrendingUp", "RotateCcw", "ShoppingBag", "GraduationCap", "Gift"];

function Cats() {
  const d = useFinance();
  const saveC = useMutate(useServerFn(saveCategory));
  const saveS = useMutate(useServerFn(saveSubcategory));
  const [type, setType] = useState<"Despesa" | "Receita">("Despesa");
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"name" | "subs">("name");
  const [cat, setCat] = useState<Partial<Category> | null>(null);
  const [sub, setSub] = useState<Partial<Subcategory> | null>(null);
  if (!d) return null;

  const list = d.categories.filter((c) => c.Type === type && c.Name.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ c, subs: d.subcategories.filter((s) => s.CategoryId === c.CategoryId) }))
    .sort((a, b) => (order === "name" ? a.c.Name.localeCompare(b.c.Name) : b.subs.length - a.subs.length));

  async function submitCat() {
    if (!cat?.Name?.trim()) return;
    const ok = await saveC.run({ CategoryId: cat.CategoryId ?? newId("cat"), Name: cat.Name, Type: cat.Type ?? type, Color: cat.Color ?? "#3b82f6", Icon: cat.Icon ?? "Tag", Active: cat.Active ?? true }, "Categoria guardada no Google Sheets");
    if (ok) setCat(null);
  }
  async function submitSub() {
    if (!sub?.Name?.trim() || !sub.CategoryId) return;
    const ok = await saveS.run({ SubcategoryId: sub.SubcategoryId ?? newId("sub"), CategoryId: sub.CategoryId, Name: sub.Name, Active: sub.Active ?? true }, "Subcategoria guardada no Google Sheets");
    if (ok) setSub(null);
  }

  return (
    <>
      <PageHeader title="Categorias e subcategorias" subtitle="Classificações independentes para receitas e despesas." actions={<Button onClick={() => setCat({ Type: type, Color: "#3b82f6", Icon: "Tag", Active: true })}><Plus className="h-4 w-4" />Nova categoria</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="inline-flex rounded-xl bg-muted p-1">{(["Despesa", "Receita"] as const).map((t) => <button key={t} onClick={() => setType(t)} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium text-muted-foreground", type === t && "bg-card shadow-card", type === t && (t === "Receita" ? "text-income" : "text-expense"))}>{t}s</button>)}</div>
        <Input placeholder="Pesquisar categoria…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 bg-card" />
        <Select value={order} onValueChange={(v) => setOrder(v as "name")}><SelectTrigger className="w-48 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">Ordenar por nome</SelectItem><SelectItem value="subs">Por nº de subcategorias</SelectItem></SelectContent></Select>
      </div>
      {list.length === 0 ? <Empty>Sem categorias. Execute a configuração inicial em Configurações para criar as categorias base.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map(({ c, subs }) => (
            <Panel key={c.CategoryId} className={cn(!c.Active && "opacity-60")}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.Color }} /><h3 className="font-semibold">{c.Name}</h3>{!c.Active && <span className="text-xs text-muted-foreground">(inativa)</span>}</div>
                <Button size="icon" variant="ghost" onClick={() => setCat(c)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {subs.map((s) => <button key={s.SubcategoryId} onClick={() => setSub(s)} className={cn("rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground hover:bg-accent", !s.Active && "line-through opacity-60")}>{s.Name}</button>)}
                <button onClick={() => setSub({ CategoryId: c.CategoryId, Active: true })} className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">+ Subcategoria</button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={!!cat} onOpenChange={(o) => !o && setCat(null)}>
        <DialogContent><DialogHeader><DialogTitle>{cat?.CategoryId ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
          {cat && <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={cat.Name ?? ""} onChange={(e) => setCat({ ...cat, Name: e.target.value })} maxLength={60} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Tipo</Label><Select value={cat.Type ?? "Despesa"} onValueChange={(v) => setCat({ ...cat, Type: v as "Receita" })} disabled={!!cat.CategoryId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Despesa">Despesa</SelectItem><SelectItem value="Receita">Receita</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Cor</Label><Input type="color" value={cat.Color} onChange={(e) => setCat({ ...cat, Color: e.target.value })} className="h-10 p-1" /></div>
            </div>
            <div className="space-y-1.5"><Label>Ícone</Label><Select value={cat.Icon ?? "Tag"} onValueChange={(v) => setCat({ ...cat, Icon: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ICONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center gap-2"><Switch checked={cat.Active ?? true} onCheckedChange={(v) => setCat({ ...cat, Active: v })} /><Label>Ativa</Label></div>
          </div>}
          <DialogFooter><Button onClick={submitCat} disabled={saveC.pending || !cat?.Name?.trim()}>{saveC.pending ? "A gravar…" : "Guardar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sub} onOpenChange={(o) => !o && setSub(null)}>
        <DialogContent><DialogHeader><DialogTitle>{sub?.SubcategoryId ? "Editar subcategoria" : "Nova subcategoria"}</DialogTitle></DialogHeader>
          {sub && <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={sub.Name ?? ""} onChange={(e) => setSub({ ...sub, Name: e.target.value })} maxLength={60} /></div>
            <div className="space-y-1.5"><Label>Categoria</Label><Select value={sub.CategoryId ?? ""} onValueChange={(v) => setSub({ ...sub, CategoryId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{d.categories.map((c) => <SelectItem key={c.CategoryId} value={c.CategoryId}>{c.Name} ({c.Type})</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center gap-2"><Switch checked={sub.Active ?? true} onCheckedChange={(v) => setSub({ ...sub, Active: v })} /><Label>Ativa</Label></div>
          </div>}
          <DialogFooter><Button onClick={submitSub} disabled={saveS.pending || !sub?.Name?.trim()}>{saveS.pending ? "A gravar…" : "Guardar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
