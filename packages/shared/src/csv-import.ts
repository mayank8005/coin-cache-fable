/**
 * Parser for CSV exports from common mobile expense trackers
 *
 * Format: date,account,category,amount,currency,converted amount,currency,description
 * Expenses have negative amounts, income positive. The delimiter and the
 * decimal separator vary with the device locale, and dates may be D/M/YYYY
 * or M/D/YYYY, so all three are detected (with a caller-provided fallback
 * for ambiguous dates).
 */

export type CsvRow = {
  /** ISO date, YYYY-MM-DD */
  date: string;
  account: string;
  category: string;
  /** Amount in minor units (paise), always positive */
  amountMinor: number;
  type: "EXPENSE" | "INCOME";
  currency: string;
  note: string;
};

export type CsvParseResult = {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
  /** true when day/month order could not be inferred and the fallback was used */
  dateOrderAmbiguous: boolean;
};

export type DateOrder = "DMY" | "MDY" | "auto";

/** Split one CSV line honouring double quotes. */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(header: string): string {
  const commas = (header.match(/,/g) ?? []).length;
  const semis = (header.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/**
 * Parse a localized amount string ("1234.56", "1.234,56", "-89 700") into
 * minor units. Returns null when unparseable.
 */
export function parseCsvAmount(raw: string): number | null {
  let s = raw.replace(/[\s ]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/^[-+]/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep = "";
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    // A single comma is a decimal separator when followed by 1-2 digits,
    // otherwise it is a thousands separator ("216,000").
    decimalSep = s.length - lastComma - 1 <= 2 ? "," : "";
  } else if (lastDot >= 0) {
    decimalSep = s.length - lastDot - 1 <= 2 ? "." : "";
  }
  let intPart = s;
  let fracPart = "0";
  if (decimalSep) {
    const idx = decimalSep === "," ? lastComma : lastDot;
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d{1,2}$/.test(fracPart)) return null;
  const minor =
    (parseInt(intPart || "0", 10) * 100 +
      parseInt(fracPart.padEnd(2, "0"), 10)) *
    (negative ? -1 : 1);
  return Number.isSafeInteger(minor) ? minor : null;
}

function detectDateOrder(dateStrs: string[]): DateOrder {
  for (const d of dateStrs) {
    const m = d.match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > 31) return "MDY"; // actually YMD, handled in parseDate
    if (a > 12) return "DMY";
    if (b > 12) return "MDY";
  }
  return "auto";
}

function parseDate(raw: string, order: "DMY" | "MDY"): string | null {
  // ISO / year-first
  let m = raw.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return null;
  let year = +m[3];
  if (year < 100) year += 2000;
  const [first, second] = [+m[1], +m[2]];
  const [day, month] = order === "DMY" ? [first, second] : [second, first];
  return toIso(year, month, day);
}

function toIso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1970 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function parseExpenseCsv(
  text: string,
  dateOrder: DateOrder = "auto",
  fallbackOrder: "DMY" | "MDY" = "DMY",
): CsvParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const errors: CsvParseResult["errors"] = [];
  const rows: CsvRow[] = [];
  if (lines.length === 0) return { rows, errors, dateOrderAmbiguous: false };

  const delim = detectDelimiter(lines[0]);
  const header = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase());
  if (!header.includes("date") || !header.includes("amount")) {
    return {
      rows,
      errors: [{ line: 1, message: "Unsupported CSV: the header row must contain 'date' and 'amount' columns" }],
      dateOrderAmbiguous: false,
    };
  }
  const col = (name: string) => header.indexOf(name);
  const iDate = col("date");
  const iAccount = col("account");
  const iCategory = col("category");
  const iAmount = col("amount");
  const iCurrency = col("currency");
  const iDesc = col("description");

  const dataLines = lines
    .map((l, i) => ({ l, n: i + 1 }))
    .slice(1)
    .filter(({ l }) => l.trim() !== "");

  let order: "DMY" | "MDY";
  let ambiguous = false;
  if (dateOrder === "auto") {
    const detected = detectDateOrder(dataLines.map(({ l }) => splitCsvLine(l, delim)[iDate] ?? ""));
    if (detected === "auto") {
      order = fallbackOrder;
      ambiguous = true;
    } else {
      order = detected;
    }
  } else {
    order = dateOrder;
  }

  for (const { l, n } of dataLines) {
    const cells = splitCsvLine(l, delim);
    const date = parseDate(cells[iDate] ?? "", order);
    if (!date) {
      errors.push({ line: n, message: `Unrecognised date "${cells[iDate] ?? ""}"` });
      continue;
    }
    const amount = parseCsvAmount(cells[iAmount] ?? "");
    if (amount === null || amount === 0) {
      errors.push({ line: n, message: `Unrecognised amount "${cells[iAmount] ?? ""}"` });
      continue;
    }
    rows.push({
      date,
      account: cells[iAccount]?.trim() || "Cash",
      category: cells[iCategory]?.trim() || "Other",
      amountMinor: Math.abs(amount),
      type: amount < 0 ? "EXPENSE" : "INCOME",
      currency: (iCurrency >= 0 ? cells[iCurrency] : "") || "",
      note: iDesc >= 0 ? (cells[iDesc] ?? "") : "",
    });
  }
  return { rows, errors, dateOrderAmbiguous: ambiguous };
}
