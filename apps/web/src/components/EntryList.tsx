"use client";

import type { Entry } from "@/lib/data";
import { formatMoney } from "@/lib/money";

const DATE_FMT = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export default function EntryList(props: {
  entries: Entry[];
  currency: string;
  locale: string;
  onEdit: (entry: Entry) => void;
}) {
  const { entries, currency, locale } = props;
  if (entries.length === 0) {
    return (
      <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-gray-400 shadow-sm">
        No records in this period. Tap − or + to add one.
      </p>
    );
  }

  const groups: { date: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.date} className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400">
            {DATE_FMT.format(new Date(g.date + "T00:00:00Z"))}
          </div>
          <ul className="divide-y divide-gray-50">
            {g.items.map((e) => (
              <li key={`${e.kind}-${e.id}`}>
                <button
                  onClick={() => props.onEdit(e)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-gray-50"
                >
                  {e.kind === "record" ? (
                    <>
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none"
                        style={{ backgroundColor: e.categoryColor + "26" }}
                      >
                        {e.categoryIcon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{e.categoryName}</div>
                        <div className="truncate text-xs text-gray-400">
                          {e.accountName}
                          {e.note ? ` · ${e.note}` : ""}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          e.type === "EXPENSE" ? "text-expense" : "text-income"
                        }`}
                      >
                        {formatMoney(e.type === "EXPENSE" ? -e.amountMinor : e.amountMinor, currency, locale, {
                          sign: true,
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg leading-none">
                        ⇄
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {e.fromAccountName} → {e.toAccountName}
                        </div>
                        <div className="truncate text-xs text-gray-400">Transfer{e.note ? ` · ${e.note}` : ""}</div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-gray-500">
                        {formatMoney(e.amountMinor, currency, locale)}
                      </span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
