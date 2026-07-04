export type Period = "day" | "week" | "month" | "year" | "all";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All" },
];

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function d(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, n: number): Date {
  const c = new Date(date);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

const MONTH_FMT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_FMT = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const SHORT_FMT = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Date range for a period at `offset` steps from the current one
 * (offset 0 = today's period, -1 = previous, ...). `end` is exclusive.
 */
export function rangeFor(
  period: Period,
  offset: number,
  todayIso: string,
): { start: string | null; end: string | null; label: string } {
  const today = d(todayIso);
  switch (period) {
    case "all":
      return { start: null, end: null, label: "All time" };
    case "day": {
      const start = addDays(today, offset);
      const label =
        offset === 0 ? "Today" : offset === -1 ? "Yesterday" : DAY_FMT.format(start);
      return { start: iso(start), end: iso(addDays(start, 1)), label };
    }
    case "week": {
      const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
      const start = addDays(today, -dow + offset * 7);
      const end = addDays(start, 7);
      const label =
        offset === 0
          ? "This week"
          : `${SHORT_FMT.format(start)} – ${SHORT_FMT.format(addDays(end, -1))}`;
      return { start: iso(start), end: iso(end), label };
    }
    case "month": {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      return { start: iso(start), end: iso(end), label: MONTH_FMT.format(start) };
    }
    case "year": {
      const y = today.getUTCFullYear() + offset;
      return {
        start: `${y}-01-01`,
        end: `${y + 1}-01-01`,
        label: String(y),
      };
    }
  }
}
