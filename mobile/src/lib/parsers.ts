import { parseAmountToCents } from "./money";

// Normalize a label for matching: uppercase, strip periods, collapse whitespace.
function norm(s: string): string {
  return (s || "").toUpperCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

// Keywords that indicate a CUMULATIVE / progressive total (NOT the daily total).
const CUMULATIVE = ["CUMULATIV", "PROGRESSIV", "GRAN TOTALE", "GRANTOTALE"];

const NUM_RE = /-?\d[\d.,]*\d|\d/g;

function lastNumberMatch(line: string): { value: number | null; index: number } {
  let m: RegExpExecArray | null;
  const re = new RegExp(NUM_RE.source, "g");
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(line)) !== null) last = m;
  if (!last) return { value: null, index: -1 };
  return { value: parseAmountToCents(last[0]), index: last.index };
}

function lastAmountOnLine(line: string): number | null {
  return lastNumberMatch(line).value;
}

export interface AzzResult {
  totalCents: number | null;
  matchedLabel: string | null;
  confidence: number;
  needsReview: boolean;
  rawText: string;
}

// Deterministic parser for the AZZERAMENTO (daily close) document.
// Finds the daily corrispettivi total using configured aliases, explicitly
// excluding cumulative/progressive totals. Never invents a value.
export function parseAzzeramento(rawText: string, aliases: string[]): AzzResult {
  const lines = (rawText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const normAliases = (aliases && aliases.length ? aliases : ["TOTALE CORRISPETTIVI"]).map(norm);
  for (let i = 0; i < lines.length; i++) {
    const nline = norm(lines[i]);
    if (CUMULATIVE.some((k) => nline.includes(k))) continue;
    const hit = normAliases.find((a) => a && nline.includes(a));
    if (!hit) continue;
    // amount on same line?
    let amt = lastAmountOnLine(lines[i]);
    let conf = 0.9;
    if (amt === null && i + 1 < lines.length) {
      const nnext = norm(lines[i + 1]);
      if (!CUMULATIVE.some((k) => nnext.includes(k))) {
        amt = lastAmountOnLine(lines[i + 1]);
        conf = 0.6;
      }
    }
    if (amt !== null) {
      return { totalCents: amt, matchedLabel: lines[i], confidence: conf, needsReview: conf < 0.7, rawText };
    }
  }
  return { totalCents: null, matchedLabel: null, confidence: 0, needsReview: true, rawText };
}

export interface RepLine { label: string; amountCents: number | null; }
export interface RepResult {
  lines: RepLine[];
  printedTotalCents: number | null;
  linesSumCents: number;
  rawText: string;
}

const TOT_RE = /\bTOT/i; // TOT EUR / TOTALE EUR / TOT. EUR

// Deterministic parser for the VENDUTO PER REPARTO document.
export function parseReparti(rawText: string): RepResult {
  const lines = (rawText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: RepLine[] = [];
  let printed: number | null = null;
  for (const line of lines) {
    const nline = norm(line);
    const lm = lastNumberMatch(line);
    const amt = lm.value;
    const isTotal = TOT_RE.test(line) && (nline.includes("EUR") || nline.includes("TOTALE"));
    if (isTotal) {
      if (amt !== null) printed = amt;
      continue;
    }
    if (amt === null) continue;
    // label = everything before the trailing amount (keeps digits inside names, e.g. "ALIMENTARI 22")
    const label = line.slice(0, lm.index).replace(/[-:.\s]+$/, "").trim();
    if (!label) continue;
    out.push({ label, amountCents: amt });
  }
  const linesSum = out.reduce((s, l) => s + (l.amountCents || 0), 0);
  return { lines: out, printedTotalCents: printed, linesSumCents: linesSum, rawText };
}

export interface Column {
  id: string; display_name: string; ocr_label: string; aliases: string[];
  include_in_reconciliation: boolean; active: boolean;
}

export interface MappingEntry { label: string; column_id: string; amount_cents: number | null; }

// Map reparti lines to columns using ocr_label + aliases, longest-match wins
// (so "ALIMENTARI" never steals "ALIMENTARI 22").
export function mapLinesToColumns(lines: RepLine[], columns: Column[]) {
  const values: Record<string, number | null> = {};
  const mapping: MappingEntry[] = [];
  const unmatched: RepLine[] = [];
  for (const ln of lines) {
    const labelN = norm(ln.label);
    let best: Column | null = null;
    let bestScore = 0;
    for (const col of columns) {
      if (!col.active) continue;
      const cands = [col.ocr_label, ...(col.aliases || [])];
      for (const cand of cands) {
        const cn = norm(cand);
        if (!cn) continue;
        let score = 0;
        if (labelN === cn) score = cn.length + 100;
        else if (labelN.startsWith(cn + " ") || (" " + labelN).includes(" " + cn + " ")) score = cn.length;
        else if (labelN.includes(cn)) score = cn.length - 1;
        if (score > bestScore) { bestScore = score; best = col; }
      }
    }
    if (best) {
      values[best.id] = ln.amountCents;
      mapping.push({ label: ln.label, column_id: best.id, amount_cents: ln.amountCents });
    } else {
      unmatched.push(ln);
    }
  }
  return { values, mapping, unmatched };
}
