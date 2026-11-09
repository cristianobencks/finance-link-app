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
  const path = ((await r.json()) as { result: { file_path: string } }).result.file_path;
  const d = await fetch(`${GW}/file/${path}`, { headers: h });
  if (!d.ok) throw new Error(`file download [${d.status}]`);
  const buf = new Uint8Array(await d.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export const reply = (chatId: number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
