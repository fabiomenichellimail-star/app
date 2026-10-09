import { parseAmountToCents, formatCents } from "../lib/money";
import { parseAzzeramento, parseReparti, mapLinesToColumns, Column } from "../lib/parsers";
import { computeReconciliation, zreportsTotal } from "../lib/reconciliation";

let P = 0, F = 0;
function ok(c: boolean, msg: string) { if (c) { P++; console.log("PASS:", msg); } else { F++; console.log("FAIL:", msg); } }

// ---- money ----
ok(parseAmountToCents("2757.40") === 275740, "2757.40");
ok(parseAmountToCents("2757,40") === 275740, "2757,40");
ok(parseAmountToCents("2.757,40") === 275740, "2.757,40");
ok(parseAmountToCents("2,757.40") === 275740, "2,757.40");
ok(parseAmountToCents("41.00") === 4100, "41.00");
ok(parseAmountToCents("1.234.567,89") === 123456789, "migliaia multiple");
ok(parseAmountToCents("€ 201,90") === 20190, "con simbolo euro");
ok(parseAmountToCents("") === null && parseAmountToCents("abc") === null, "vuoto/non numerico -> null");
ok(formatCents(275740) === "2.757,40" && formatCents(4100) === "41,00", "formatCents");

// ---- columns (acceptance test) ----
const columns: Column[] = [
  { id: "c1", display_name: "IVA 10% Ristorante", ocr_label: "RISTORANTE", aliases: [], include_in_reconciliation: true, active: true },
  { id: "c2", display_name: "IVA 10% Bar", ocr_label: "BAR", aliases: [], include_in_reconciliation: true, active: true },
  { id: "c3", display_name: "IVA 22% Alimentari", ocr_label: "ALIMENTARI 22", aliases: [], include_in_reconciliation: true, active: true },
  { id: "c4", display_name: "IVA 10% Alimentari", ocr_label: "ALIMENTARI 10", aliases: [], include_in_reconciliation: true, active: true },
  { id: "c5", display_name: "Bombole", ocr_label: "BOMBOLE", aliases: [], include_in_reconciliation: true, active: true },
  { id: "c6", display_name: "IVA 4% Alimentari", ocr_label: "ALIMENTARI 4", aliases: [], include_in_reconciliation: true, active: true },
];

// ---- azzeramento parser: must pick GIORNO, not CUMULATIVO ----
const azzText = [
  "REGISTRATORE DI CASSA", "AZZERAMENTO GIORNALIERO", "DATA 12-08-2026",
  "TOT. CUMULATIVO CORR.   1234567.89",
  "TOT. CORRISPETTIVO GIORNO   2757.40",
].join("\n");
const azz = parseAzzeramento(azzText, ["TOT. CORRISPETTIVO GIORNO", "TOTALE CORRISPETTIVI"]);
ok(azz.totalCents === 275740, `azzeramento totale GIORNO 275740 (got ${azz.totalCents})`);
ok(azz.totalCents !== 123456789, "azzeramento NON usa il cumulativo");

// amount on next line
const azz2 = parseAzzeramento("TOT. CORRISPETTIVO GIORNO\n2757,40", ["TOT. CORRISPETTIVO GIORNO"]);
ok(azz2.totalCents === 275740 && azz2.confidence < 0.7, "azzeramento importo su riga successiva (needsReview)");

// not found -> needsReview, no invented value
const azz3 = parseAzzeramento("SCONTRINO ILLEGGIBILE", ["TOT. CORRISPETTIVO GIORNO"]);
ok(azz3.totalCents === null && azz3.needsReview, "azzeramento non trovato -> null + DA CONTROLLARE");

// ---- reparti parser + mapping (acceptance) ----
const repText = [
  "SUPERMERCATO ROSSI", "VENDUTO PER REPARTO",
  "RISTORANTE        2353.40",
  "BAR                201.90",
  "ALIMENTARI 22       80.05",
  "ALIMENTARI 10       42.40",
  "BOMBOLE             41.00",
  "ALIMENTARI 4        38.65",
  "TOT EUR:         2757.40",
].join("\n");
const rep = parseReparti(repText);
ok(rep.lines.length === 6, `reparti 6 righe (got ${rep.lines.length})`);
ok(rep.linesSumCents === 275740, `somma righe 275740 (got ${rep.linesSumCents})`);
ok(rep.printedTotalCents === 275740, `TOT EUR 275740 (got ${rep.printedTotalCents})`);
ok(rep.linesSumCents === rep.printedTotalCents, "Controllo A: somma righe == TOT EUR (esatto)");

const { values, unmatched } = mapLinesToColumns(rep.lines, columns);
ok(unmatched.length === 0, `mapping senza righe non associate (got ${unmatched.length})`);
ok(values["c1"] === 235340, "RISTORANTE -> IVA 10% Ristorante 235340");
ok(values["c3"] === 8005, "ALIMENTARI 22 -> IVA 22% (non confuso con ALIMENTARI)");
ok(values["c4"] === 4240 && values["c6"] === 3865, "ALIMENTARI 10 e 4 corretti");

// ---- quadratura zero-tolerance ----
let r = computeReconciliation(columns, 275740, values);
ok(r.departmentsTotal === 275740 && r.difference === 0 && r.status === "VERIFICATO", "275740 vs 275740 -> VERIFICATO diff 0");
r = computeReconciliation(columns, 275740, { ...values, c6: 3864 });
ok(r.difference === 1 && r.status === "NON_QUADRATO", "vs 275739 -> NON_QUADRATO +1");
r = computeReconciliation(columns, 275740, { ...values, c6: 3866 });
ok(r.difference === -1 && r.status === "NON_QUADRATO", "vs 275741 -> NON_QUADRATO -1");
r = computeReconciliation(columns, null, values);
ok(r.status === "DA_CONTROLLARE", "totale mancante -> DA_CONTROLLARE");

// ---- multi-azzeramento ----
ok(zreportsTotal([{ amount_cents: 50000 }, { amount_cents: 36558 }]) === 86558, "500,00 + 365,58 = 86558");
ok(zreportsTotal([{ amount_cents: 10000 }, { amount_cents: 20000 }, { amount_cents: 5055 }]) === 35055, "3 azzeramenti somma esatta");
ok(zreportsTotal([]) === null, "nessun azzeramento -> null");
const zt = zreportsTotal([{ amount_cents: 50000 }, { amount_cents: 36558 }])!;
const rz = computeReconciliation([{ id: "x", display_name: "R", ocr_label: "R", aliases: [], include_in_reconciliation: true, active: true }], zt, { x: 86558 });
ok(rz.difference === 0 && rz.status === "VERIFICATO", "multi-azz 86558 vs 86558 -> VERIFICATO");

// ---- column order + active/include flags (config acceptance) ----
const expectedOrder = ["IVA 10% Ristorante", "IVA 10% Bar", "IVA 22% Alimentari", "IVA 10% Alimentari", "Bombole", "IVA 4% Alimentari"];
ok(JSON.stringify(columns.map((c) => c.display_name)) === JSON.stringify(expectedOrder), "ordine colonne configurate (Data/Totale sono fisse prima)");
// a non-included column must NOT affect the quadratura
const withExtra = [...columns, { id: "extra", display_name: "Note (no quad)", ocr_label: "NOTE", aliases: [], include_in_reconciliation: false, active: true }];
const rExtra = computeReconciliation(withExtra, 275740, { ...values, extra: 99999 });
ok(rExtra.difference === 0 && rExtra.status === "VERIFICATO", "colonna non inclusa non altera la quadratura");
// a deactivated column is excluded from reconciliation
const withInactive = columns.map((c) => (c.id === "c5" ? { ...c, active: false } : c));
const rInact = computeReconciliation(withInactive, 275740, values);
ok(rInact.departmentsTotal === 275740 - 4100, "colonna disattivata esclusa dalla somma reparti");

console.log(`\n=== MOBILE LOGIC: ${P} PASS / ${F} FAIL ===`);
if (F > 0) process.exit(1);