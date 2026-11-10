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

export class FileMismatchError extends Error {
  constructor() { super("Downloaded Telegram file does not match the sent file"); }
}

// Downloads a Telegram file (photo/document) as base64.
export async function downloadFile(fileId: string) {
  const lk = process.env["LOVABLE_API_KEY"], tk = process.env["TELEGRAM_API_KEY"];
  if (!lk || !tk) throw new Error("Telegram not configured");
  const h = { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": tk };
  const r = await fetch(`${GW}/getFile`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ file_id: fileId }) });
  if (!r.ok) throw new Error(`getFile [${r.status}]`);
  const result = (await r.json()) as { ok: boolean; result?: { file_path?: string; file_size?: number }; description?: string };
  const path = result.result?.file_path;
  const expected = result.result?.file_size;
  if (!result.ok || !path) throw new Error(`getFile: ${result.description ?? "Missing file path"}`);
  // Telegram paths (e.g. photos/file_0.jpg) are not globally unique across bots, and the
  // deployed runtime has received another bot's bytes for the same path. Prefer the direct
  // Telegram file URL (bot token in TELEGRAM_BOT_TOKEN), fall back to the gateway.
  const bot = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  let d: Response;
  if (bot) {
    d = await fetch(`https://api.telegram.org/file/bot${bot}/${path}`, { cache: "no-store" });
  } else {
    const resource = createHash("sha256").update(`${tk}:${fileId}`).digest("hex");
    const url = new URL(`${GW}/file/${path}`);
    url.searchParams.set("resource", resource);
    url.searchParams.set("request", crypto.randomUUID());
    d = await fetch(url.toString(), {
      cache: "no-store",
      headers: { ...h, "Cache-Control": "no-cache, no-store", Pragma: "no-cache" },
    });
  }
  if (!d.ok) throw new Error(`file download [${d.status}]`);
  const buf = new Uint8Array(await d.arrayBuffer());
  // Never process bytes that don't match the file Telegram described (wrong/cached file).
  if (expected && buf.length !== expected) {
    console.error(`Telegram file size mismatch: expected ${expected}, got ${buf.length} (direct=${!!bot})`);
    throw new FileMismatchError();
  }
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export const reply = (chatId: number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
