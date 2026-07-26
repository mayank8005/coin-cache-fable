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
 * What `<input type="number">` can hand us — "250", ".5", "1e3" — and nothing
 * else: `Number()` would otherwise also swallow "0x10", "0b11" and "Infinity".
 */
const NUMBER_INPUT_VALUE = /^(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/** Mirrors `amountSchema`'s cap in actions.ts: nothing larger can be stored. */
const MAX_AMOUNT_MINOR = 9_000_000_000_000;

/**
 * Parse a positive money amount ("250" or "99.50") into minor units, else null.
 * Shared by the search route (min/max params) and `searchEntries` (exact-amount
 * matching) so both round the same way.
 *
 * `amountMinor` is a Prisma BigInt column: handing it a non-integer Float throws
 * at query time, so anything unrepresentable (or beyond the write-path cap) is
 * rejected here and the caller simply drops the filter / matches nothing.
 */
export function parseAmountMinor(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  if (!NUMBER_INPUT_VALUE.test(text)) return null;
  const minor = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT_MINOR) return null;
  return minor;
}
