import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { getDb, listRegisters, getRegister, listEntries, createRegister, addColumn, saveEntry } from "../db";
import { nowIso } from "../lib/util";

const SCHEMA_VERSION = 1;

// Export ALL data as a versioned JSON backup (no photos — not stored).
export async function exportBackup() {
  const regs = await listRegisters();
  const out: any = { schema_version: SCHEMA_VERSION, app: "registro-corrispettivi", exported_at: nowIso(), registers: [] };
  for (const r of regs) {
    const full = await getRegister(r.id);
    const entries = await listEntries(r.id);
    out.registers.push({
      name: full.name, business_name: full.business_name, year: full.year,
      start_date: full.start_date, end_date: full.end_date, total_aliases: full.total_aliases,
      columns: full.columns.map((c: any) => ({
        id: c.id, display_name: c.display_name, ocr_label: c.ocr_label, aliases: c.aliases,
        include_in_reconciliation: c.include_in_reconciliation, active: c.active,
      })),
      entries: entries.map((e: any) => ({
        business_date: e.business_date, printed_total_cents: e.printed_total_cents,
        z_reports: e.z_reports.map((z: any) => ({ amount_cents: z.amount_cents, detected_date: z.detected_date, confidence: z.confidence })),
        values: e.values,
      })),
    });
  }
  const json = JSON.stringify(out, null, 2);
  const uri = FileSystem.documentDirectory + `backup-corrispettivi-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/json", UTI: "public.json" });
  }
  return uri;
}

export interface BackupPreview { valid: boolean; error?: string; registers?: number; entries?: number; data?: any; }

// Read + validate a backup WITHOUT applying it (for the confirm dialog).
export async function pickAndValidateBackup(): Promise<BackupPreview> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
  if (picked.canceled) return { valid: false, error: "annullato" };
  try {
    const text = await FileSystem.readAsStringAsync(picked.assets[0].uri);
    const data = JSON.parse(text);
    if (data.schema_version !== SCHEMA_VERSION || !Array.isArray(data.registers)) {
      return { valid: false, error: "File di backup non valido o versione non supportata" };
    }
    const entries = data.registers.reduce((s: number, r: any) => s + (r.entries?.length || 0), 0);
    return { valid: true, registers: data.registers.length, entries, data };
  } catch (e: any) {
    return { valid: false, error: "File JSON non leggibile" };
  }
}

// Apply a validated backup. Creates NEW registers (never overwrites existing data silently).
export async function applyBackup(data: any): Promise<number> {
  let count = 0;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const r of data.registers) {
      const newId = await createRegister({
        name: r.name, business_name: r.business_name, year: r.year,
        start_date: r.start_date, end_date: r.end_date, total_aliases: r.total_aliases || [], columns: [],
      });
      const idMap: Record<string, string> = {};
      let i = 0;
      for (const c of r.columns || []) {
        const nid = await addColumn(newId, c, i++);
        if (c.id) idMap[c.id] = nid;
      }
      for (const e of r.entries || []) {
        const values: Record<string, number | null> = {};
        for (const [oldCid, amt] of Object.entries(e.values || {})) {
          const nid = idMap[oldCid] || oldCid;
          values[nid] = amt as number;
        }
        await saveEntry(newId, {
          business_date: e.business_date, z_reports: e.z_reports || [],
          values, printed_total_cents: e.printed_total_cents,
        });
      }
      count++;
    }
  });
  return count;
}
