import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatCents } from "../lib/money";
import { formatDateIt, MONTHS_IT } from "../lib/util";
import { Column } from "../lib/parsers";

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}

// Build an A4 landscape PDF locally (real vector PDF, not a screenshot).
export async function exportPdf(register: any, columns: Column[], entries: any[], month: string | null) {
  const active = columns.filter((c) => c.active);
  let period = "";
  if (month && month.includes("-")) {
    const [y, m] = month.split("-");
    period = `${MONTHS_IT[parseInt(m, 10) - 1]} ${y}`;
  } else if (register.year) period = String(register.year);

  const totals: any = { total: 0 };
  active.forEach((c) => (totals[c.id] = 0));
  const bodyRows = entries.map((e) => {
    totals.total += e.total_receipts_cents || 0;
    const tds = active.map((c) => {
      const v = (e.values || {})[c.id];
      totals[c.id] += v || 0;
      return `<td class="num">${v != null ? formatCents(v) : ""}</td>`;
    }).join("");
    return `<tr><td>${formatDateIt(e.business_date)}</td><td class="num">${e.total_receipts_cents != null ? formatCents(e.total_receipts_cents) : ""}</td>${tds}</tr>`;
  }).join("");
  const totTds = active.map((c) => `<td class="num">${formatCents(totals[c.id])}</td>`).join("");
  const heads = active.map((c) => `<th>${esc(c.display_name)}</th>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: -apple-system, Roboto, sans-serif; color:#0f172a; }
    h1 { font-size:16px; margin:0 0 2px; }
    .sub { font-size:10px; color:#475569; margin:0 0 10px; }
    table { width:100%; border-collapse:collapse; font-size:9px; }
    th,td { border:0.4px solid #cbd5e1; padding:4px 5px; }
    th { background:#0f172a; color:#fff; text-align:center; }
    td { text-align:left; }
    td.num, th { text-align:right; }
    th:first-child, td:first-child { text-align:left; }
    tr:nth-child(even) td { background:#f8fafc; }
    tfoot td { font-weight:bold; background:#e2e8f0; border-top:1px solid #0f172a; }
  </style></head><body>
    <h1>REGISTRO DEI CORRISPETTIVI</h1>
    <p class="sub">${esc(register.name)}${register.business_name ? " — " + esc(register.business_name) : ""}${period ? " — " + period : ""}</p>
    <table><thead><tr><th>Data</th><th>Totale Corrispettivi</th>${heads}</tr></thead>
    <tbody>${bodyRows}</tbody>
    <tfoot><tr><td>TOTALI</td><td class="num">${formatCents(totals.total)}</td>${totTds}</tr></tfoot>
    </table></body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  }
  return uri;
}

// Trigger the native Android print dialog with the generated PDF.
export async function printPdf(register: any, columns: Column[], entries: any[], month: string | null) {
  const active = columns.filter((c) => c.active);
  // reuse exportPdf HTML by calling Print.printAsync with same markup
  const uri = await exportPdf(register, columns, entries, month);
  try { await Print.printAsync({ uri }); } catch {}
  return uri;
}
