import { requireUser } from "@/lib/auth";
import {
  getAccountsWithBalances,
  getCategories,
  getSettings,
  searchEntries,
} from "@/lib/data";
import {
  parseIsoDate,
  rangeFor,
  todayInTz,
  SEARCH_RANGES,
  type SearchRange,
} from "@/lib/periods";
import { parseAmountMinor } from "@/lib/money";
import { parseSearchBy } from "@/lib/search";
import SearchView from "@/components/SearchView";

export const dynamic = "force-dynamic";

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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
    : "month") as SearchRange;
  const categoryId = typeof sp.category === "string" && sp.category !== "" ? sp.category : null;
  const accountId = typeof sp.account === "string" && sp.account !== "" ? sp.account : null;
  let from = parseIsoDate(sp.from);
  let to = parseIsoDate(sp.to);
  if (from && to && from > to) [from, to] = [to, from];
  const searchBy = parseSearchBy(sp.by);
  let minMinor = parseAmountMinor(sp.min);
  let maxMinor = parseAmountMinor(sp.max);
  if (minMinor !== null && maxMinor !== null && minMinor > maxMinor)
    [minMinor, maxMinor] = [maxMinor, minMinor];
  const page = Math.max(1, Math.min(1000, parseInt(String(sp.page ?? "1"), 10) || 1));

  const settings = await getSettings(user.id);
  const today = todayInTz(settings.timezone);

  let start: string | null = null;
  let end: string | null = null;
  if (range === "month") {
    ({ start, end } = rangeFor("month", 0, today));
  } else if (range === "lastmonth") {
    ({ start, end } = rangeFor("month", -1, today));
  } else if (range === "3m") {
    start = rangeFor("month", -2, today).start;
    end = rangeFor("month", 0, today).end;
  } else if (range === "year") {
    ({ start, end } = rangeFor("year", 0, today));
  } else if (range === "custom") {
    start = from;
    end = to ? nextDay(to) : null;
  }

  const [result, accounts, categories] = await Promise.all([
    searchEntries(
      user.id,
      { q, type, categoryId, accountId, start, end, minMinor, maxMinor, searchBy },
      page,
    ),
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
      searchBy={searchBy}
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
