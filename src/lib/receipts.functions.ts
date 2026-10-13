import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Expense photos live in a Google Drive folder of the connected account; the sheet stores "drive:<fileId>".
const DEFAULT_FOLDER = "1MDrQCrniu7mOvY2zJWkKLaFJbJAsCr6e";
const GW = "https://connector-gateway.lovable.dev/google_drive";

function headers() {
  const a = process.env["LOVABLE_API_KEY"], b = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!a || !b) throw new Error("Google Drive não está ligado.");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b };
}
async function fail(r: Response): Promise<never> {
  const t = await r.text();
  console.error(`Drive [${r.status}]: ${t}`);
  throw new Error(`Falha no Google Drive (${r.status}).`);
}

export const uploadReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().max(120).regex(/^[\w.-]+$/),
    mime: z.string().regex(/^image\/[\w.+-]+$/),
    base64: z.string().max(11_000_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const folder = process.env["DRIVE_RECEIPTS_FOLDER_ID"] || DEFAULT_FOLDER;
    const meta = { name: data.name, parents: [folder], appProperties: { userId: context.userId } };
    const boundary = "evx" + crypto.randomUUID();
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${data.mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${data.base64}\r\n--${boundary}--`;
    const r = await fetch(`${GW}/upload/drive/v3/files?uploadType=multipart&fields=id`, {
      method: "POST", headers: { ...headers(), "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    });
    if (!r.ok) await fail(r);
    const { id } = (await r.json()) as { id: string };
    return { path: `drive:${id}` };
  });

export const getReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().regex(/^drive:[\w-]+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const id = data.path.slice(6);
    const m = await fetch(`${GW}/drive/v3/files/${id}?fields=mimeType,appProperties`, { headers: headers() });
    if (!m.ok) await fail(m);
    const meta = (await m.json()) as { mimeType: string; appProperties?: { userId?: string } };
    if (meta.appProperties?.userId !== context.userId) throw new Error("Sem acesso a esta foto.");
    const r = await fetch(`${GW}/drive/v3/files/${id}?alt=media`, { headers: headers() });
    if (!r.ok) await fail(r);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { dataUrl: `data:${meta.mimeType};base64,${btoa(s)}` };
  });
