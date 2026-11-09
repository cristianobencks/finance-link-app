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

export const reply = (chatId: number, text: string) => tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
