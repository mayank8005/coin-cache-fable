"use client";

import type { Entry } from "@/lib/data";
import { formatMoney } from "@/lib/money";

const DATE_FMT = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

type Group = {
  key: string;
  header: React.ReactNode;
  items: Entry[];
};

export default function EntryList(props: {
  entries: Entry[];
  currency: string;
  locale: string;
  groupBy?: "date" | "category";
  emptyText?: string;
  onEdit: (entry: Entry) => void;
}) {
  const { entries, currency, locale } = props;
  const groupBy = props.groupBy ?? "date";
  if (entries.length === 0) {
    return (
      <p className="rounded-xl bg-white px-4 py-8 text-center text-sm text-gray-400 shadow-sm">
        {props.emptyText ?? "No records in this period. Tap − or + to add one."}
      </p>
    );
  }

  let groups: Group[];
  if (groupBy === "date") {
    groups = [];
    for (const e of entries) {
      const last = groups[groups.length - 1];
      if (last && last.key === e.date) last.items.push(e);
      else
        groups.push({
          key: e.date,
          header: DATE_FMT.format(new Date(e.date + "T00:00:00Z")),
          items: [e],
        });
    }
  } else {
    type CatGroup = {
      key: string;
      name: string;
      icon: string;
      color: string;
      totalMinor: number;
      isTransfer: boolean;
      items: Entry[];
    };
    const map = new Map<string, CatGroup>();
    for (const e of entries) {
      const key = e.kind === "record" ? e.categoryId : "transfer";
      let g = map.get(key);
      if (!g) {
        g =
          e.kind === "record"
            ? {
                key,
                name: e.categoryName,
                icon: e.categoryIcon,
                color: e.categoryColor,
                totalMinor: 0,
                isTransfer: false,
                items: [],
              }
            : {
                key,
                name: "Transfers",
                icon: "⇄",
                color: "#9ca3af",
                totalMinor: 0,
                isTransfer: true,
                items: [],
              };
        map.set(key, g);
      }
      g.totalMinor += e.amountMinor;
      g.items.push(e);
    }
    groups = [...map.values()]
      .sort((a, b) =>
        a.isTransfer !== b.isTransfer ? (a.isTransfer ? 1 : -1) : b.totalMinor - a.totalMinor,
      )
      .map((g) => ({
        key: g.key,
        header: (
          <span className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none"
              style={{ backgroundColor: g.color + "26" }}
            >
              {g.icon}
            </span>
            <span className="text-gray-600">{g.name}</span>
            <span className="text-gray-300">·</span>
            <span>{g.items.length}</span>
            <span className="ml-auto font-semibold text-gray-600">
              {formatMoney(g.totalMinor, currency, locale)}
            </span>
          </span>
        ),
        items: g.items,
      }));
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.key} className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400">
            {g.header}
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
                        <div className="truncate text-sm font-medium">
                          {groupBy === "category" ? e.note || e.categoryName : e.categoryName}
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {groupBy === "category"
                            ? `${SHORT_DATE_FMT.format(new Date(e.date + "T00:00:00Z"))} · ${e.accountName}`
                            : `${e.accountName}${e.note ? ` · ${e.note}` : ""}`}
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
                        <div className="truncate text-xs text-gray-400">
                          {groupBy === "category"
                            ? `${SHORT_DATE_FMT.format(new Date(e.date + "T00:00:00Z"))}${e.note ? ` · ${e.note}` : ""}`
                            : `Transfer${e.note ? ` · ${e.note}` : ""}`}
                        </div>
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
