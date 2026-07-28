"use client";

import { useId, useState } from "react";
import type { Entry } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { MONTH_FMT } from "@/lib/periods";

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
  groupBy?: "date" | "category" | "month";
  /** Cards start open; the toggle state below is read as "flipped from default". */
  defaultExpanded?: boolean;
  showProgressBar?: boolean;
  /** Rendered next to (never inside) the header button. */
  headerAction?: (group: { key: string; label: string }) => React.ReactNode;
  emptyText?: string;
  onEdit: (entry: Entry) => void;
}) {
  const { entries, currency, locale } = props;
  const groupBy = props.groupBy ?? "date";
  const defaultExpanded = props.defaultExpanded ?? false;
  const showProgressBar = props.showProgressBar !== false;
  // Holds the keys toggled away from `defaultExpanded`, so groups that appear
  // or disappear across filter round-trips keep the intended default.
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
  if (groupBy === "date" || groupBy === "month") {
    // Entries arrive date-desc, so equal keys are always adjacent.
    groups = [];
    for (const e of entries) {
      const key = groupBy === "month" ? e.date.slice(0, 7) : e.date;
      const last = groups[groups.length - 1];
      if (last && last.key === key) addToGroup(last, e);
      else {
        const group: Group = {
          key,
          label:
            groupBy === "month"
              ? MONTH_FMT.format(new Date(e.date.slice(0, 7) + "-01T00:00:00Z"))
              : DATE_FMT.format(new Date(e.date + "T00:00:00Z")),
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

  // Only date-grouped cards carry the date in the header, so every other mode
  // repeats it on the row.
  const showRowDate = groupBy !== "date";

  const totalExpenseMinor = entries.reduce(
    (sum, entry) =>
      entry.kind === "record" && entry.type === "EXPENSE" ? sum + entry.amountMinor : sum,
    0,
  );

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const toggled = openGroups.has(g.key);
        const open = defaultExpanded ? !toggled : toggled;
        const contentId = `${idPrefix}-group-${g.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
        const expenseShare = totalExpenseMinor > 0 ? g.expenseMinor / totalExpenseMinor : 0;
        const percent = Math.round(expenseShare * 100);
        // A group can hold both directions (a month with salary and spending),
        // so show every non-zero side; transfers are the fallback.
        const summaries: { label: string; amount: number; className: string }[] = [];
        if (g.expenseMinor > 0)
          summaries.push({ label: "Spent", amount: g.expenseMinor, className: "text-expense" });
        if (g.incomeMinor > 0)
          summaries.push({ label: "Income", amount: g.incomeMinor, className: "text-income" });
        if (summaries.length === 0)
          summaries.push({
            label: "Transferred",
            amount: g.transferMinor,
            className: "text-gray-500",
          });

        const headerButton = (
          <button
            type="button"
            onClick={() => toggleGroup(g.key)}
            aria-expanded={open}
            aria-controls={contentId}
            aria-label={`${open ? "Collapse" : "Expand"} ${g.label}, ${g.items.length} ${
              g.items.length === 1 ? "record" : "records"
            }`}
            className={`w-full px-3 py-2.5 text-left active:bg-gray-50${
              props.headerAction ? " min-w-0 flex-1" : ""
            }`}
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
            <span className="mt-2 flex items-baseline gap-3">
              {summaries.map((s) => (
                <span key={s.label} className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-gray-400">{s.label}</span>
                  <span className={`text-sm font-semibold ${s.className}`}>
                    {formatMoney(s.amount, currency, locale)}
                  </span>
                </span>
              ))}
              {showProgressBar && g.expenseMinor > 0 && (
                <span className="ml-auto text-xs font-medium text-gray-400">{percent}%</span>
              )}
            </span>
            {showProgressBar && g.expenseMinor > 0 && (
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
        );

        return (
          <div key={g.key} className="overflow-hidden rounded-xl bg-white shadow-sm">
            {props.headerAction ? (
              <div className="flex items-center">
                {headerButton}
                {props.headerAction({ key: g.key, label: g.label })}
              </div>
            ) : (
              headerButton
            )}
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
                            {[
                              ...(showRowDate
                                ? [SHORT_DATE_FMT.format(new Date(e.date + "T00:00:00Z"))]
                                : []),
                              e.accountName,
                              // The note is the row title in category mode.
                              ...(e.note && groupBy !== "category" ? [e.note] : []),
                            ].join(" · ")}
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
                            {[
                              showRowDate
                                ? SHORT_DATE_FMT.format(new Date(e.date + "T00:00:00Z"))
                                : "Transfer",
                              ...(e.note ? [e.note] : []),
                            ].join(" · ")}
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
