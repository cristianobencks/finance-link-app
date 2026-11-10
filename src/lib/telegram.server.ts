import { createHash } from "crypto";

const GW = "https://connector-gateway.lovable.dev/telegram";

export function webhookSecret() {
  const k = process.env["TELEGRAM_API_KEY"];
  if (!k) throw new Error("TELEGRAM_API_KEY is not configured");
  return createHash("sha256").update(`telegram-webhook:${k}`).digest("base64url");
}

export async function tg(method: string, body: Record<string, unknown>) {
  const lk = process.env["LOVABLE_API_KEY"];
  const tk = process.env["TELEGRAM_API_KEY"];
  if (!lk || !tk) throw new Error("Telegram not configured");
  const res = await fetch(`${GW}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": tk, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`Telegram ${method} failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
}

// Downloads a Telegram file (photo/document) as base64.
export async function downloadFile(fileId: string) {
  const lk = process.env["LOVABLE_API_KEY"], tk = process.env["TELEGRAM_API_KEY"];
  if (!lk || !tk) throw new Error("Telegram not configured");
  const h = { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": tk };
  const r = await fetch(`${GW}/getFile`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ file_id: fileId }) });
  if (!r.ok) throw new Error(`getFile [${r.status}]`);
  const result = (await r.json()) as { ok: boolean; result?: { file_path?: string }; description?: string };
  const path = result.result?.file_path;
  if (!result.ok || !path) throw new Error(`getFile: ${result.description ?? "Missing file path"}`);
  // Telegram paths (e.g. photos/file_0.jpg) are not globally unique across bots.
  // Do not allow intermediary caches to reuse another bot's bytes for that path.
  const resource = createHash("sha256").update(`${tk}:${fileId}`).digest("hex");
  const url = new URL(`${GW}/file/${path}`);
  url.searchParams.set("resource", resource);
  url.searchParams.set("request", crypto.randomUUID());
  const d = await fetch(url.toString(), {
    cache: "no-store",
    headers: { ...h, "Cache-Control": "no-cache, no-store", Pragma: "no-cache" },
  });
  if (!d.ok) throw new Error(`file download [${d.status}]`);
  const buf = new Uint8Array(await d.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export const reply = (chatId: number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
