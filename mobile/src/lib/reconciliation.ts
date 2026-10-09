import { Column } from "./parsers";

export const STATUS_VERIFICATO = "VERIFICATO";
export const STATUS_NON_QUADRATO = "NON_QUADRATO";
export const STATUS_DA_CONTROLLARE = "DA_CONTROLLARE";

export interface ZReport { id?: string; amount_cents: number | null; detected_date?: string | null; confidence?: number | null; order_index?: number; }

// Total corrispettivi = exact integer-cent sum of all azzeramenti of the day.
export function zreportsTotal(zreports: ZReport[] | null | undefined): number | null {
  if (!zreports || zreports.length === 0) return null;
  const vals = zreports.filter((z) => z.amount_cents != null).map((z) => z.amount_cents as number);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

export interface ReconResult { departmentsTotal: number; difference: number | null; status: string; }

// Zero-tolerance reconciliation. VERIFICATO only if difference === 0 exactly.
export function computeReconciliation(
  columns: Column[],
  totalReceiptsCents: number | null,
  values: Record<string, number | null>,
  statusHint?: string | null
): ReconResult {
  const includedIds = new Set(columns.filter((c) => c.include_in_reconciliation && c.active).map((c) => c.id));
  let departmentsTotal = 0;
  for (const [cid, amt] of Object.entries(values || {})) {
    if (includedIds.has(cid) && amt != null) departmentsTotal += amt;
  }
  const total = totalReceiptsCents == null ? null : totalReceiptsCents;
  let difference: number | null = total == null ? null : total - departmentsTotal;
  let status: string;
  if (statusHint === STATUS_DA_CONTROLLARE) status = STATUS_DA_CONTROLLARE;
  else if (total == null) status = STATUS_DA_CONTROLLARE;
  else if (difference === 0) status = STATUS_VERIFICATO;
  else status = STATUS_NON_QUADRATO;
  return { departmentsTotal, difference, status };
}
