export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
  opts: { sign?: boolean; compactZeroFraction?: boolean } = {},
): string {
  const value = minor / 100;
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: minor % 100 === 0 && opts.compactZeroFraction !== false ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const s = fmt.format(Math.abs(value));
  if (opts.sign) return (minor < 0 ? "−" : "+") + s;
  return minor < 0 ? "−" + s : s;
}

/**
 * Parse a positive money amount ("250" or "99.50") into minor units, else null.
 * Shared by the search route (min/max params) and `searchEntries` (exact-amount
 * matching) so both round the same way.
 */
export function parseAmountMinor(v: unknown): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** "1234.5" -> 123450 minor units; null when invalid. */
export function toMinor(input: string | number): number | null {
  const n = typeof input === "number" ? input : parseFloat(input);
  if (!Number.isFinite(n)) return null;
  const minor = Math.round(n * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}
