import { SHEETS, ID_COLUMN, seedRows, type SheetName } from "./schema";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";
const DEFAULT_SPREADSHEET_ID = "1FfqpSEpcXycrVT18fg2ZPpIiGncivKFGVuJoU5FixTs";

export class SheetsError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

function cfg() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !sheetsKey) throw new SheetsError("A ligação ao Google Sheets não está configurada.", 503);
  return { lovableKey, sheetsKey };
}

export const masterSpreadsheetId = () => process.env["SPREADSHEET_ID"] || DEFAULT_SPREADSHEET_ID;

export function spreadsheetUrl(sid: string) {
  return `https://docs.google.com/spreadsheets/d/${sid}/edit`;
}

async function call<T = unknown>(sid: string, path: string, init?: RequestInit): Promise<T> {
  const { lovableKey, sheetsKey } = cfg();
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_URL}/spreadsheets${sid ? `/${sid}` : ""}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": sheetsKey,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new SheetsError("Não foi possível comunicar com o Google Sheets. Tente novamente.", 503);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Sheets request failed [${res.status}] ${path.split("?")[0]}: ${body.slice(0, 300)}`);
    const msg =
      res.status === 403 ? "Sem permissão para aceder à folha de cálculo."
      : res.status === 404 ? "Folha de cálculo não encontrada."
      : res.status === 429 ? "Limite de pedidos do Google atingido. Aguarde um minuto e tente novamente."
      : res.status >= 500 ? "O Google Sheets está temporariamente indisponível."
      : `Pedido inválido ao Google Sheets (${res.status}).`;
    throw new SheetsError(msg, res.status);
  }
  return (await res.json()) as T;
}

export const colLetter = (i: number) => {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

type AllCols = (typeof SHEETS)[SheetName][number];
export type Row = Record<string, string> & { [K in AllCols]?: string };
export type Table = { headers: string[]; rows: { row: number; obj: Row }[] };

function toTable(values: string[][] | undefined): Table {
  const [headers = [], ...rest] = values ?? [];
  const rows = rest
    .map((r, i) => ({ row: i + 2, obj: Object.fromEntries(headers.map((h, c) => [h, r[c] ?? ""])) as Row }))
    .filter((r) => Object.values(r.obj).some((v) => v !== ""));
  return { headers, rows };
}

function validate(name: SheetName, t: Table) {
  const missing = SHEETS[name].filter((h) => !t.headers.includes(h));
  if (missing.length) throw new SheetsError(`A aba ${name} não tem as colunas: ${missing.join(", ")}. Execute a configuração inicial.`, 409);
}

export async function readAll(sid: string): Promise<Record<SheetName, Table>> {
  const names = Object.keys(SHEETS) as SheetName[];
  const qs = names.map((n) => `ranges=${n}!A1:Z`).join("&");
  const r = await call<{ valueRanges: { values?: string[][] }[] }>(sid, `/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`);
  const out = {} as Record<SheetName, Table>;
  names.forEach((n, i) => {
    const t = toTable((r.valueRanges[i]?.values ?? []).map((row) => row.map((v) => String(v ?? ""))));
    validate(n, t);
    out[n] = t;
  });
  return out;
}

export async function readTable(sid: string, name: SheetName): Promise<Table> {
  const r = await call<{ values?: unknown[][] }>(sid, `/values/${name}!A1:Z?valueRenderOption=UNFORMATTED_VALUE`);
  const t = toTable((r.values ?? []).map((row) => row.map((v) => String(v ?? ""))));
  validate(name, t);
  return t;
}

const toRow = (headers: string[], obj: Record<string, unknown>) =>
  headers.map((h) => (obj[h] === undefined || obj[h] === null ? "" : typeof obj[h] === "boolean" ? (obj[h] ? "TRUE" : "FALSE") : obj[h]));

/**
 * Insert or update by ID. An existing ID is updated (never duplicated), so a retried
 * request after a network failure cannot create a second record.
 * If expectedUpdatedAt is given and differs, the write is rejected (concurrent edit).
 */
export async function upsert(sid: string, name: SheetName, obj: Record<string, unknown>, expectedUpdatedAt?: string) {
  const t = await readTable(sid, name);
  const idCol = ID_COLUMN[name];
  const id = String(obj[idCol]);
  const existing = t.rows.find((r) => r.obj[idCol] === id);
  const now = new Date().toISOString();
  if (existing) {
    if (expectedUpdatedAt && existing.obj.UpdatedAt && existing.obj.UpdatedAt !== expectedUpdatedAt) {
      throw new SheetsError("Este registo foi alterado entretanto. Recarregue e tente novamente.", 409);
    }
    const merged = { ...existing.obj, ...obj, CreatedAt: existing.obj.CreatedAt || now, UpdatedAt: now };
    const last = colLetter(t.headers.length - 1);
    await call(sid, `/values/${name}!A${existing.row}:${last}${existing.row}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [toRow(t.headers, merged)] }),
    });
    return { created: false, UpdatedAt: now };
  }
  const full = { ...obj, CreatedAt: now, UpdatedAt: now };
  await call(sid, `/values/${name}!A1:${colLetter(t.headers.length - 1)}1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [toRow(t.headers, full)] }),
  });
  return { created: true, UpdatedAt: now };
}

const sheetIdCache = new Map<string, Record<string, number>>();
async function sheetIds(sid: string) {
  const hit = sheetIdCache.get(sid);
  if (hit) return hit;
  const meta = await call<{ sheets: { properties: { sheetId: number; title: string } }[] }>(sid, `?fields=sheets.properties`);
  const ids = Object.fromEntries(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  sheetIdCache.set(sid, ids);
  return ids;
}

/** Delete rows whose column `col` equals one of `values`. Deletes bottom-up so indexes stay valid. */
export async function deleteWhere(sid: string, name: SheetName, col: string, values: string[]) {
  const t = await readTable(sid, name);
  const rows = t.rows.filter((r) => values.includes(r.obj[col] ?? "")).map((r) => r.row).sort((a, b) => b - a);
  if (!rows.length) return 0;
  const ids = await sheetIds(sid);
  await call(sid, `:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: rows.map((r) => ({ deleteDimension: { range: { sheetId: ids[name], dimension: "ROWS", startIndex: r - 1, endIndex: r } } })),
    }),
  });
  return rows.length;
}

/** Creates missing tabs/headers and seeds default categories. Never overwrites existing data. */
export async function initialize(sid: string) {
  sheetIdCache.delete(sid);
  const ids = await sheetIds(sid);
  const missingTabs = (Object.keys(SHEETS) as SheetName[]).filter((n) => ids[n] === undefined);
  if (missingTabs.length) {
    await call(sid, `:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: missingTabs.map((title) => ({ addSheet: { properties: { title } } })) }) });
    sheetIdCache.delete(sid);
  }
  const names = Object.keys(SHEETS) as SheetName[];
  const qs = names.map((n) => `ranges=${n}!1:1`).join("&");
  const heads = await call<{ valueRanges: { values?: string[][] }[] }>(sid, `/values:batchGet?${qs}`);
  const data: { range: string; values: string[][] }[] = [];
  names.forEach((n, i) => {
    const current = heads.valueRanges[i]?.values?.[0] ?? [];
    if (current.length === 0) data.push({ range: `${n}!A1`, values: [[...SHEETS[n]]] });
    else {
      const missing = SHEETS[n].filter((h) => !current.includes(h));
      if (missing.length) data.push({ range: `${n}!${colLetter(current.length)}1`, values: [missing] });
    }
  });
  if (data.length) await call(sid, `/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });

  const all = await readAll(sid);
  const now = new Date().toISOString();
  const { cats, subs } = seedRows();
  const haveCats = new Set(all.Categories.rows.map((r) => r.obj.CategoryId));
  const haveSubs = new Set(all.Subcategories.rows.map((r) => r.obj.SubcategoryId));
  const newCats = cats.filter((c) => !haveCats.has(c.CategoryId)).map((c) => toRow(all.Categories.headers, { ...c, CreatedAt: now, UpdatedAt: now }));
  const newSubs = subs.filter((s) => !haveSubs.has(s.SubcategoryId)).map((s) => toRow(all.Subcategories.headers, { ...s, CreatedAt: now, UpdatedAt: now }));
  if (newCats.length) await call(sid, `/values/Categories!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: newCats }) });
  if (newSubs.length) await call(sid, `/values/Subcategories!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: newSubs }) });
  return { createdTabs: missingTabs.length, seededCategories: newCats.length, seededSubcategories: newSubs.length };
}

/** Creates a new spreadsheet (in the connected Google account) with all tabs/headers and default categories. */
export async function createSpreadsheet(title: string) {
  const r = await call<{ spreadsheetId: string }>("", "", {
    method: "POST",
    body: JSON.stringify({ properties: { title, locale: "pt_PT", timeZone: "Europe/Lisbon" }, sheets: (Object.keys(SHEETS) as SheetName[]).map((t) => ({ properties: { title: t } })) }),
  });
  await initialize(r.spreadsheetId);
  return r.spreadsheetId;
}
