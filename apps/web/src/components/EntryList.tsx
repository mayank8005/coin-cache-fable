"use client";

import { useId, useState } from "react";
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
  label: string;
  icon?: string;
  color: string;
  totalMinor: number;
  expenseMinor: number;
  incomeMinor: number;
  transferMinor: number;
  isTransfer: boolean;
  items: Entry[];
};

function addToGroup(group: Group, entry: Entry) {
  group.totalMinor += entry.amountMinor;
  if (entry.kind === "transfer") group.transferMinor += entry.amountMinor;
  else if (entry.type === "EXPENSE") group.expenseMinor += entry.amountMinor;
  else group.incomeMinor += entry.amountMinor;
  group.items.push(entry);
}

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
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const idPrefix = useId().replaceAll(":", "");

  function toggleGroup(key: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
      if (last && last.key === e.date) addToGroup(last, e);
      else {
        const group: Group = {
          key: e.date,
          label: DATE_FMT.format(new Date(e.date + "T00:00:00Z")),
          color: "#e53935",
          totalMinor: 0,
          expenseMinor: 0,
          incomeMinor: 0,
          transferMinor: 0,
          isTransfer: false,
          items: [],
        };
        addToGroup(group, e);
        groups.push(group);
      }
    }
  } else {
    const map = new Map<string, Group>();
    for (const e of entries) {
      const key = e.kind === "record" ? e.categoryId : "transfer";
      let g = map.get(key);
      if (!g) {
        g =
          e.kind === "record"
            ? {
                key,
                label: e.categoryName,
                icon: e.categoryIcon,
                color: e.categoryColor,
                totalMinor: 0,
                expenseMinor: 0,
                incomeMinor: 0,
                transferMinor: 0,
                isTransfer: false,
                items: [],
              }
            : {
                key,
                label: "Transfers",
                icon: "⇄",
                color: "#9ca3af",
                totalMinor: 0,
                expenseMinor: 0,
                incomeMinor: 0,
                transferMinor: 0,
                isTransfer: true,
                items: [],
              };
        map.set(key, g);
      }
      addToGroup(g, e);
    }
    groups = [...map.values()].sort((a, b) =>
      a.isTransfer !== b.isTransfer ? (a.isTransfer ? 1 : -1) : b.totalMinor - a.totalMinor,
    );
  }

  const totalExpenseMinor = entries.reduce(
    (sum, entry) =>
      entry.kind === "record" && entry.type === "EXPENSE" ? sum + entry.amountMinor : sum,
    0,
  );

  return (
    <div className="space-y-3">
      {groups.map((g, index) => {
        const open = openGroups.has(g.key);
        const contentId = `${idPrefix}-group-${index}`;
        const expenseShare = totalExpenseMinor > 0 ? g.expenseMinor / totalExpenseMinor : 0;
        const percent = Math.round(expenseShare * 100);
        const summary =
          g.expenseMinor > 0
            ? { label: "Spent", amount: g.expenseMinor, className: "text-expense" }
            : g.incomeMinor > 0
              ? { label: "Income", amount: g.incomeMinor, className: "text-income" }
              : { label: "Transferred", amount: g.transferMinor, className: "text-gray-500" };

        return (
          <div key={g.key} className="overflow-hidden rounded-xl bg-white shadow-sm">
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              aria-expanded={open}
              aria-controls={contentId}
              aria-label={`${open ? "Collapse" : "Expand"} ${g.label}, ${g.items.length} ${
                g.items.length === 1 ? "record" : "records"
              }`}
              className="w-full px-3 py-2.5 text-left active:bg-gray-50"
            >
              <span className="flex items-center gap-2">
                {g.icon && (
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm leading-none"
                    style={{ backgroundColor: g.color + "26" }}
                    aria-hidden="true"
                  >
                    {g.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700">
                  {g.label}
                </span>
                <span className="text-xs font-medium text-gray-400">
                  {g.items.length} {g.items.length === 1 ? "record" : "records"}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
              <span className="mt-2 flex items-baseline gap-2">
                <span className="text-xs font-medium text-gray-400">{summary.label}</span>
                <span className={`text-sm font-semibold ${summary.className}`}>
                  {formatMoney(summary.amount, currency, locale)}
                </span>
                {g.expenseMinor > 0 && (
                  <span className="ml-auto text-xs font-medium text-gray-400">{percent}%</span>
                )}
              </span>
              {g.expenseMinor > 0 && (
                <span
                  role="progressbar"
                  aria-label={`${g.label} share of expenses`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-valuetext={`${percent}% of expenses`}
                  className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-gray-100"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.max(2, expenseShare * 100)}%`, backgroundColor: g.color }}
                  />
                </span>
              )}
            </button>
            <ul
              id={contentId}
              hidden={!open}
              className="divide-y divide-gray-50 border-t border-gray-100"
            >
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
                            {formatMoney(
                              e.type === "EXPENSE" ? -e.amountMinor : e.amountMinor,
                              currency,
                              locale,
                              { sign: true },
                            )}
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
        );
      })}
    </div>
  );
}
