import { requireUser } from "@/lib/auth";
import {
  getAccountsWithBalances,
  getCategories,
  getSettings,
  searchEntries,
} from "@/lib/data";
import { rangeFor, lastDaysRange, todayInTz, SEARCH_RANGES, type SearchRange } from "@/lib/periods";
import SearchView from "@/components/SearchView";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Parse a positive money amount ("250" or "99.50") into minor units, else null. */
function parseAmount(v: unknown): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const q = typeof sp.q === "string" ? sp.q : "";
  const type = (["EXPENSE", "INCOME", "TRANSFER"].includes(String(sp.type))
    ? sp.type
    : null) as "EXPENSE" | "INCOME" | "TRANSFER" | null;
  const range = (SEARCH_RANGES.some((r) => r.id === sp.range)
    ? sp.range
    : "90d") as SearchRange;
  const categoryId = typeof sp.category === "string" && sp.category !== "" ? sp.category : null;
  const accountId = typeof sp.account === "string" && sp.account !== "" ? sp.account : null;
  let from = typeof sp.from === "string" && ISO_DATE.test(sp.from) ? sp.from : null;
  let to = typeof sp.to === "string" && ISO_DATE.test(sp.to) ? sp.to : null;
  if (from && to && from > to) [from, to] = [to, from];
  let minMinor = parseAmount(sp.min);
  let maxMinor = parseAmount(sp.max);
  if (minMinor !== null && maxMinor !== null && minMinor > maxMinor)
    [minMinor, maxMinor] = [maxMinor, minMinor];
  const page = Math.max(1, Math.min(1000, parseInt(String(sp.page ?? "1"), 10) || 1));

  const settings = await getSettings(user.id);
  const today = todayInTz(settings.timezone);

  let start: string | null = null;
  let end: string | null = null;
  if (range === "90d") {
    ({ start, end } = lastDaysRange(90, today));
  } else if (range === "year") {
    ({ start, end } = rangeFor("year", 0, today));
  } else if (range === "custom") {
    start = from;
    end = to ? nextDay(to) : null;
  }

  const [result, accounts, categories] = await Promise.all([
    searchEntries(user.id, { q, type, categoryId, accountId, start, end, minMinor, maxMinor }, page),
    getAccountsWithBalances(user.id),
    getCategories(user.id),
  ]);

  return (
    <SearchView
      q={q}
      type={type}
      range={range}
      from={from}
      to={to}
      min={typeof sp.min === "string" ? sp.min : ""}
      max={typeof sp.max === "string" ? sp.max : ""}
      categoryId={categoryId}
      accountId={accountId}
      page={page}
      result={result}
      accounts={accounts}
      categories={categories}
      currency={settings.currency}
      locale={settings.locale}
      todayIso={today}
    />
  );
}
