import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { formatDateIt } from "../lib/util";
import { Column } from "../lib/parsers";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Generate a real .xlsx locally (numeric currency cells, TOTALI row, Controlli sheet).
export async function exportXlsx(register: any, columns: Column[], entries: any[], fileBase: string) {
  const active = columns.filter((c) => c.active);
  const header = ["Data", "Totale Corrispettivi", ...active.map((c) => c.display_name)];
  const rows: any[][] = [header];
  const totals: number[] = new Array(active.length + 1).fill(0);

  for (const e of entries) {
    const row: any[] = [formatDateIt(e.business_date)];
    const tr = (e.total_receipts_cents || 0) / 100;
    row.push(e.total_receipts_cents != null ? tr : null);
    totals[0] += e.total_receipts_cents || 0;
    active.forEach((c, i) => {
      const v = (e.values || {})[c.id];
      row.push(v != null ? v / 100 : null);
      totals[i + 1] += v || 0;
    });
    rows.push(row);
  }
  rows.push(["TOTALI", totals[0] / 100, ...active.map((_, i) => totals[i + 1] / 100)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // currency number format on numeric cells (cols B..)
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 1; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") { cell.t = "n"; cell.z = '#,##0.00" €"'; }
    }
  }
  ws["!cols"] = [{ wch: 12 }, { wch: 20 }, ...active.map(() => ({ wch: 16 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Registro");

  // Controlli sheet
  const ctrl: any[][] = [["Data", "Totale Azzeramento", "Somma Reparti", "Differenza", "Stato"]];
  for (const e of entries) {
    ctrl.push([
      formatDateIt(e.business_date),
      (e.total_receipts_cents || 0) / 100,
      (e.departments_total_cents || 0) / 100,
      (e.difference_cents || 0) / 100,
      e.reconciliation_status || "",
    ]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(ctrl);
  XLSX.utils.book_append_sheet(wb, ws2, "Controlli");

  const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  const uri = FileSystem.documentDirectory + `${fileBase}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, UTI: "org.openxmlformats.spreadsheetml.sheet" });
  }
  return uri;
}
