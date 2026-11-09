import { generateResponse } from "@lovable.dev/ai-gateway";

// Reads a receipt/invoice (image or PDF) with AI and returns the expense fields.
export type ReceiptData = { amount: number; description: string; date: string; categoryId: string; subcategoryId: string };
type Opt = { id: string; name: string };

const schema = {
  type: "object", additionalProperties: false,
  required: ["isReceipt", "amount", "description", "date", "categoryId", "subcategoryId"],
  properties: {
    isReceipt: { type: "boolean" },
    amount: { type: "number", description: "Total pago em EUR" },
    description: { type: "string", description: "Estabelecimento e o que foi comprado, curto" },
    date: { type: "string", description: "AAAA-MM-DD ou vazio" },
    categoryId: { type: "string" },
    subcategoryId: { type: "string" },
  },
};

export async function readReceipt(mime: string, base64: string, cats: Opt[], subs: (Opt & { categoryId: string })[]): Promise<ReceiptData | null> {
  const dataUrl = `data:${mime};base64,${base64}`;
  const file = mime === "application/pdf"
    ? { type: "input_file" as const, filename: "fatura.pdf", file_data: dataUrl }
    : { type: "input_image" as const, image_url: dataUrl, detail: "auto" as const };
  const res = await generateResponse({
    model: "openai/gpt-6-astra",
    instructions: "Extrai dados de talões/faturas portuguesas. Responde em JSON.",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: `Lê este documento e devolve JSON com o total pago, descrição curta em português, data (AAAA-MM-DD) e a categoria/subcategoria de despesa mais adequada das listas. Se não for um talão/fatura, isReceipt=false.\nCategorias: ${JSON.stringify(cats)}\nSubcategorias: ${JSON.stringify(subs)}` },
        file,
      ],
    }],
    text: { format: { type: "json_schema", name: "receipt", strict: true, schema } },
  });
  let txt = "";
  for (const item of (res as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? []) {
    if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") txt += c.text ?? "";
  }
  const j = JSON.parse(txt) as ReceiptData & { isReceipt: boolean };
  if (!j.isReceipt || !(j.amount > 0)) return null;
  const sub = subs.find((s) => s.id === j.subcategoryId);
  const categoryId = cats.some((c) => c.id === j.categoryId) ? j.categoryId : sub?.categoryId ?? cats[0]?.id ?? "";
  return {
    amount: Math.round(j.amount * 100) / 100,
    description: j.description.trim().slice(0, 120) || "Despesa",
    date: /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : "",
    categoryId,
    subcategoryId: sub && sub.categoryId === categoryId ? sub.id : "",
  };
}

// Stores the file in the expenses Drive folder, tagged with the owner userId.
export async function saveToDrive(name: string, mime: string, base64: string, userId: string) {
  const a = process.env["LOVABLE_API_KEY"], b = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!a || !b) throw new Error("Google Drive não está ligado.");
  const folder = process.env["DRIVE_RECEIPTS_FOLDER_ID"] || "1MDrQCrniu7mOvY2zJWkKLaFJbJAsCr6e";
  const meta = { name, parents: [folder], appProperties: { userId } };
  const boundary = "evx" + crypto.randomUUID();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const r = await fetch("https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", headers: { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!r.ok) throw new Error(`Drive [${r.status}]: ${(await r.text()).slice(0, 300)}`);
  return `drive:${((await r.json()) as { id: string }).id}`;
}
