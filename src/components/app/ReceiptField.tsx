import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "receipts";
const MAX = 10 * 1024 * 1024;

export async function receiptUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export function useReceiptUrl(path?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!path) return;
    let live = true;
    receiptUrl(path).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [path]);
  return url;
}

/** Upload/preview of an expense photo. Value is the private storage path ("" = none). */
export function ReceiptField({ value, onChange, txId, disabled }: { value: string; onChange: (v: string) => void; txId: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = useReceiptUrl(value || undefined);
  const isTiff = /\.tiff?$/i.test(value);

  async function pick(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Escolha um ficheiro de imagem (JPG, PNG, TIFF…)."); return; }
    if (file.size > MAX) { toast.error("A imagem não pode ter mais de 10 MB."); return; }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada.");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${u.user.id}/${txId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange(path);
      toast.success("Foto anexada. Guarde a movimentação para a associar.");
    } catch (e) {
      toast.error(`Não foi possível enviar a foto: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (disabled) return <p className="text-xs text-muted-foreground">Anexos indisponíveis no modo demonstração.</p>;

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="image/*,.tif,.tiff,.heic" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-2">
          {url && !isTiff ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto da despesa" className="h-20 w-20 rounded-lg object-cover" /></a>
            : <a href={url ?? "#"} target="_blank" rel="noreferrer" className="text-sm text-primary underline">{url ? "Abrir imagem" : "A carregar…"}</a>}
          <div className="flex-1 truncate text-xs text-muted-foreground">{value.split("/").pop()}</div>
          <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy}>Trocar</Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Remover foto" onClick={() => onChange("")}><X className="h-4 w-4" /></Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{busy ? "A enviar…" : "Anexar foto"}
        </Button>
      )}
    </div>
  );
}

export function ReceiptPreview({ path }: { path: string }) {
  const url = useReceiptUrl(path);
  if (!url) return <span className="text-xs text-muted-foreground">A carregar…</span>;
  if (/\.tiff?$/i.test(path)) return <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">Abrir imagem</a>;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto da despesa" className="mt-1 max-h-64 rounded-lg border object-contain" /></a>;
}
