import * as SQLite from "expo-sqlite";
import { genId, nowIso } from "./lib/util";
import { Column } from "./lib/parsers";
import { computeReconciliation, zreportsTotal, ZReport } from "./lib/reconciliation";

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync("corrispettivi.db");
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS registers (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, business_name TEXT,
      year INTEGER, start_date TEXT, end_date TEXT, total_aliases TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS register_columns (
      id TEXT PRIMARY KEY NOT NULL, register_id TEXT NOT NULL,
      display_name TEXT NOT NULL, ocr_label TEXT, aliases TEXT,
      order_index INTEGER, include_in_reconciliation INTEGER, active INTEGER, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_entries (
      id TEXT PRIMARY KEY NOT NULL, register_id TEXT NOT NULL, business_date TEXT NOT NULL,
      total_receipts_cents INTEGER, departments_total_cents INTEGER, printed_total_cents INTEGER,
      difference_cents INTEGER, reconciliation_status TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_entry_date ON daily_entries(register_id, business_date);
    CREATE TABLE IF NOT EXISTS z_reports (
      id TEXT PRIMARY KEY NOT NULL, daily_entry_id TEXT NOT NULL, amount_cents INTEGER,
      detected_date TEXT, confidence REAL, order_index INTEGER, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_entry_values (
      daily_entry_id TEXT NOT NULL, register_column_id TEXT NOT NULL, amount_cents INTEGER,
      PRIMARY KEY (daily_entry_id, register_column_id)
    );
  `);
  return _db;
}

// ---------- Registers ----------
export async function listRegisters() {
  const db = await getDb();
  const regs = await db.getAllAsync<any>("SELECT * FROM registers ORDER BY updated_at DESC");
  for (const r of regs) {
    const c = await db.getFirstAsync<any>("SELECT COUNT(*) n FROM daily_entries WHERE register_id=?", r.id);
    r.entries_count = c?.n ?? 0;
  }
  return regs;
}

export async function createRegister(data: any) {
  const db = await getDb();
  const id = genId();
  await db.runAsync(
    `INSERT INTO registers (id,name,business_name,year,start_date,end_date,total_aliases,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, data.name, data.business_name || "", data.year ?? null, data.start_date ?? null,
    data.end_date ?? null, JSON.stringify(data.total_aliases || []), nowIso(), nowIso()
  );
  let i = 0;
  for (const col of data.columns || []) {
    await addColumn(id, col, i++);
  }
  return id;
}

export async function getRegister(id: string) {
  const db = await getDb();
  const reg = await db.getFirstAsync<any>("SELECT * FROM registers WHERE id=?", id);
  if (!reg) return null;
  reg.total_aliases = JSON.parse(reg.total_aliases || "[]");
  reg.columns = await getColumns(id);
  return reg;
}

export async function updateRegister(id: string, patch: any) {
  const db = await getDb();
  const cur = await db.getFirstAsync<any>("SELECT * FROM registers WHERE id=?", id);
  if (!cur) return;
  await db.runAsync(
    `UPDATE registers SET name=?,business_name=?,year=?,start_date=?,end_date=?,total_aliases=?,updated_at=? WHERE id=?`,
    patch.name ?? cur.name, patch.business_name ?? cur.business_name, patch.year ?? cur.year,
    patch.start_date ?? cur.start_date, patch.end_date ?? cur.end_date,
    JSON.stringify(patch.total_aliases ?? JSON.parse(cur.total_aliases || "[]")), nowIso(), id
  );
}

export async function deleteRegister(id: string) {
  const db = await getDb();
  const entries = await db.getAllAsync<any>("SELECT id FROM daily_entries WHERE register_id=?", id);
  for (const e of entries) {
    await db.runAsync("DELETE FROM z_reports WHERE daily_entry_id=?", e.id);
    await db.runAsync("DELETE FROM daily_entry_values WHERE daily_entry_id=?", e.id);
  }
  await db.runAsync("DELETE FROM daily_entries WHERE register_id=?", id);
  await db.runAsync("DELETE FROM register_columns WHERE register_id=?", id);
  await db.runAsync("DELETE FROM registers WHERE id=?", id);
}

export async function duplicateRegister(id: string, name: string, year: number | null) {
  const src = await getRegister(id);
  if (!src) return null;
  const newId = await createRegister({
    name: name || `${src.name} (copia)`, business_name: src.business_name,
    year, total_aliases: src.total_aliases, columns: [],
  });
  let i = 0;
  for (const col of src.columns) {
    await addColumn(newId, col, i++);
  }
  return newId; // entries intentionally NOT copied
}

// ---------- Columns ----------
export async function getColumns(registerId: string): Promise<Column[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM register_columns WHERE register_id=? ORDER BY order_index", registerId);
  return rows.map((c) => ({
    id: c.id, display_name: c.display_name, ocr_label: c.ocr_label || "",
    aliases: JSON.parse(c.aliases || "[]"),
    include_in_reconciliation: !!c.include_in_reconciliation, active: !!c.active,
    order_index: c.order_index,
  })) as any;
}

export async function addColumn(registerId: string, col: any, order?: number) {
  const db = await getDb();
  const id = col.id || genId();
  let ord = order;
  if (ord === undefined) {
    const m = await db.getFirstAsync<any>("SELECT MAX(order_index) mx FROM register_columns WHERE register_id=?", registerId);
    ord = (m?.mx ?? -1) + 1;
  }
  await db.runAsync(
    `INSERT INTO register_columns (id,register_id,display_name,ocr_label,aliases,order_index,include_in_reconciliation,active,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, registerId, col.display_name, col.ocr_label || "", JSON.stringify(col.aliases || []),
    ord ?? 0, col.include_in_reconciliation === false ? 0 : 1, col.active === false ? 0 : 1, nowIso()
  );
  return id;
}

export async function updateColumn(id: string, patch: any) {
  const db = await getDb();
  const cur = await db.getFirstAsync<any>("SELECT * FROM register_columns WHERE id=?", id);
  if (!cur) return;
  await db.runAsync(
    `UPDATE register_columns SET display_name=?,ocr_label=?,aliases=?,include_in_reconciliation=?,active=? WHERE id=?`,
    patch.display_name ?? cur.display_name, patch.ocr_label ?? cur.ocr_label,
    JSON.stringify(patch.aliases ?? JSON.parse(cur.aliases || "[]")),
    (patch.include_in_reconciliation ?? !!cur.include_in_reconciliation) ? 1 : 0,
    (patch.active ?? !!cur.active) ? 1 : 0, id
  );
}

export async function deleteColumn(id: string) {
  const db = await getDb();
  await db.runAsync("DELETE FROM register_columns WHERE id=?", id);
  await db.runAsync("DELETE FROM daily_entry_values WHERE register_column_id=?", id);
}

export async function reorderColumns(ids: string[]) {
  const db = await getDb();
  for (let i = 0; i < ids.length; i++) {
    await db.runAsync("UPDATE register_columns SET order_index=? WHERE id=?", i, ids[i]);
  }
}

// True if the column has any historical values stored (then prefer deactivation to deletion).
export async function columnHasData(columnId: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.getFirstAsync<any>(
    "SELECT COUNT(*) n FROM daily_entry_values WHERE register_column_id=? AND amount_cents IS NOT NULL",
    columnId);
  return (r?.n ?? 0) > 0;
}


// ---------- Entries ----------
async function hydrateEntry(e: any) {
  const db = await getDb();
  e.z_reports = await db.getAllAsync<any>(
    "SELECT * FROM z_reports WHERE daily_entry_id=? ORDER BY order_index", e.id);
  const vals = await db.getAllAsync<any>(
    "SELECT * FROM daily_entry_values WHERE daily_entry_id=?", e.id);
  e.values = {};
  for (const v of vals) e.values[v.register_column_id] = v.amount_cents;
  return e;
}

export async function listEntries(registerId: string, month?: string | null) {
  const db = await getDb();
  let rows: any[];
  if (month) {
    rows = await db.getAllAsync<any>(
      "SELECT * FROM daily_entries WHERE register_id=? AND business_date LIKE ? ORDER BY business_date",
      registerId, month + "%");
  } else {
    rows = await db.getAllAsync<any>(
      "SELECT * FROM daily_entries WHERE register_id=? ORDER BY business_date", registerId);
  }
  for (const r of rows) await hydrateEntry(r);
  return rows;
}

export async function getEntry(id: string) {
  const db = await getDb();
  const e = await db.getFirstAsync<any>("SELECT * FROM daily_entries WHERE id=?", id);
  return e ? hydrateEntry(e) : null;
}

export async function checkDuplicate(registerId: string, date: string) {
  const db = await getDb();
  const e = await db.getFirstAsync<any>(
    "SELECT * FROM daily_entries WHERE register_id=? AND business_date=?", registerId, date);
  if (!e) return { exists: false, entry: null as any };
  return { exists: true, entry: await hydrateEntry(e) };
}

// Upsert a day: ONE row per (register_id, business_date). Total = sum of z_reports.
export async function saveEntry(registerId: string, payload: {
  id?: string; business_date: string; z_reports: ZReport[];
  values: Record<string, number | null>; printed_total_cents?: number | null; status_hint?: string | null;
}) {
  const db = await getDb();
  const columns = await getColumns(registerId);
  const total = zreportsTotal(payload.z_reports);
  const { departmentsTotal, difference, status } = computeReconciliation(
    columns, total, payload.values, payload.status_hint);

  const existing = await db.getFirstAsync<any>(
    "SELECT * FROM daily_entries WHERE register_id=? AND business_date=?", registerId, payload.business_date);
  const entryId = payload.id || existing?.id || genId();
  const isNew = !existing && !payload.id;

  if (isNew) {
    await db.runAsync(
      `INSERT INTO daily_entries (id,register_id,business_date,total_receipts_cents,departments_total_cents,printed_total_cents,difference_cents,reconciliation_status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      entryId, registerId, payload.business_date, total, departmentsTotal,
      payload.printed_total_cents ?? null, difference, status, nowIso(), nowIso());
  } else {
    await db.runAsync(
      `UPDATE daily_entries SET business_date=?,total_receipts_cents=?,departments_total_cents=?,printed_total_cents=?,difference_cents=?,reconciliation_status=?,updated_at=? WHERE id=?`,
      payload.business_date, total, departmentsTotal, payload.printed_total_cents ?? null,
      difference, status, nowIso(), entryId);
  }
  // rewrite z_reports
  await db.runAsync("DELETE FROM z_reports WHERE daily_entry_id=?", entryId);
  let i = 0;
  for (const z of payload.z_reports) {
    await db.runAsync(
      `INSERT INTO z_reports (id,daily_entry_id,amount_cents,detected_date,confidence,order_index,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      z.id || genId(), entryId, z.amount_cents ?? null, z.detected_date ?? null,
      z.confidence ?? null, i++, nowIso(), nowIso());
  }
  // rewrite values
  await db.runAsync("DELETE FROM daily_entry_values WHERE daily_entry_id=?", entryId);
  for (const [cid, amt] of Object.entries(payload.values || {})) {
    if (amt != null) {
      await db.runAsync(
        "INSERT INTO daily_entry_values (daily_entry_id,register_column_id,amount_cents) VALUES (?,?,?)",
        entryId, cid, amt);
    }
  }
  return getEntry(entryId);
}

export async function addZReportToExisting(entryId: string, z: ZReport) {
  const e = await getEntry(entryId);
  if (!e) return null;
  const merged = [...e.z_reports, z];
  return saveEntry(e.register_id, {
    id: entryId, business_date: e.business_date, z_reports: merged,
    values: e.values, printed_total_cents: e.printed_total_cents,
  });
}

export async function deleteEntry(id: string) {
  const db = await getDb();
  await db.runAsync("DELETE FROM z_reports WHERE daily_entry_id=?", id);
  await db.runAsync("DELETE FROM daily_entry_values WHERE daily_entry_id=?", id);
  await db.runAsync("DELETE FROM daily_entries WHERE id=?", id);
}
