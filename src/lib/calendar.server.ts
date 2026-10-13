// Server-only: mirrors pending expenses into the connected Google Calendar (owner's account).
const GW = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const CAL_NAME = "Cristiano Rocha";

function headers() {
  const a = process.env["LOVABLE_API_KEY"], b = process.env["GOOGLE_CALENDAR_API_KEY"];
  if (!a || !b) throw new Error("Google Agenda não está ligado.");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

let calId: string | null = null;
async function calendarId() {
  if (calId) return calId;
  const r = await fetch(`${GW}/users/me/calendarList?fields=items(id,summary,accessRole)`, { headers: headers() });
  if (!r.ok) throw new Error(`Agenda [${r.status}]: ${await r.text()}`);
  const items = ((await r.json()).items ?? []) as { id: string; summary: string; accessRole: string }[];
  const hit = items.find((c) => c.summary?.trim().toLowerCase() === CAL_NAME.toLowerCase() && c.accessRole === "owner");
  calId = hit?.id ?? "primary";
  return calId;
}

/** Deterministic event id (base32hex-compatible hex) so edits update the same event. */
const eventId = (txId: string) => "mcf" + Array.from(new TextEncoder().encode(txId)).map((b) => b.toString(16).padStart(2, "0")).join("");

const nextDay = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

export async function syncExpenseEvent(tx: { TransactionId: string; Type: string; Status: string; Description: string; DueDate: string; TransactionDate: string; Amount: number }) {
  const cal = encodeURIComponent(await calendarId());
  const id = eventId(tx.TransactionId);
  const url = `${GW}/calendars/${cal}/events/${id}`;
  if (tx.Type !== "Despesa" || tx.Status !== "Pendente") {
    const r = await fetch(url, { method: "DELETE", headers: headers() });
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Agenda [${r.status}]: ${await r.text()}`);
    return;
  }
  const date = tx.DueDate || tx.TransactionDate;
  const body = {
    summary: tx.Description,
    description: `Despesa pendente: ${tx.Amount.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}`,
    start: { date }, end: { date: nextDay(date) }, status: "confirmed",
  };
  let r = await fetch(url, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  if (r.status === 404) r = await fetch(`${GW}/calendars/${cal}/events`, { method: "POST", headers: headers(), body: JSON.stringify({ ...body, id }) });
  if (!r.ok) throw new Error(`Agenda [${r.status}]: ${await r.text()}`);
}
