// Money utilities — all amounts are integer cents. Never use floats for money.
export function parseAmountToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Math.round(value) * 100;
  let s = String(value).trim().replace(/[^0-9,.\-]/g, "");
  if (["", "-", ".", ","].includes(s)) return null;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const lc = s.lastIndexOf(",");
  const ld = s.lastIndexOf(".");
  const dp = Math.max(lc, ld);
  let cents: number;
  if (dp === -1) {
    const digits = s.replace(/[.,]/g, "");
    if (!digits) return null;
    cents = parseInt(digits, 10) * 100;
  } else {
    const frac = s.slice(dp + 1);
    const intp = s.slice(0, dp);
    if (frac.length !== 2) {
      const digits = s.replace(/[.,]/g, "");
      cents = parseInt(digits, 10) * 100;
    } else {
      const id = intp.replace(/[.,]/g, "") || "0";
      cents = parseInt(id, 10) * 100 + parseInt(frac, 10);
    }
  }
  return neg ? -cents : cents;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const neg = cents < 0;
  let c = Math.abs(Math.round(cents));
  const e = Math.floor(c / 100);
  const r = c % 100;
  const grouped = String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + grouped + "," + String(r).padStart(2, "0");
}

export function formatEuro(cents: number | null | undefined): string {
  const s = formatCents(cents);
  return s === "" ? "" : "€ " + s;
}
