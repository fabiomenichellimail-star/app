export function formatCents(cents) {
  if (cents === null || cents === undefined || cents === "") return "";
  const neg = cents < 0;
  let c = Math.abs(Math.round(cents));
  const e = Math.floor(c / 100);
  const r = c % 100;
  return (neg ? "-" : "") + e.toLocaleString("it-IT") + "," + String(r).padStart(2, "0");
}

export function formatEuro(cents) {
  const s = formatCents(cents);
  return s === "" ? "" : "€ " + s;
}

export function parseToCents(value) {
  if (value === null || value === undefined) return null;
  let s = ("" + value).trim();
  s = s.replace(/[^0-9,.\-]/g, "");
  if (["", "-", ".", ","].includes(s)) return null;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const lc = s.lastIndexOf(",");
  const ld = s.lastIndexOf(".");
  const dp = Math.max(lc, ld);
  let cents;
  if (dp === -1) {
    const digits = s.replace(/[.,]/g, "");
    cents = parseInt(digits || "0", 10) * 100;
  } else {
    const frac = s.slice(dp + 1);
    const intp = s.slice(0, dp);
    if (frac.length !== 2) {
      const digits = s.replace(/[.,]/g, "");
      cents = parseInt(digits || "0", 10) * 100;
    } else {
      const id = intp.replace(/[.,]/g, "") || "0";
      cents = parseInt(id, 10) * 100 + parseInt(frac, 10);
    }
  }
  return neg ? -cents : cents;
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatDateIT(iso) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export const MONTHS_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
