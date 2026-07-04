"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Entry, PlainAccount, PlainCategory, SearchResult } from "@/lib/data";
import { SEARCH_PAGE_SIZE, SEARCH_RANGES, type SearchRange } from "@/lib/periods";
import { formatMoney } from "@/lib/money";
import EntryList from "./EntryList";
import RecordDialog from "./RecordDialog";
import TransferDialog from "./TransferDialog";

const TYPES: { id: "EXPENSE" | "INCOME" | "TRANSFER"; label: string }[] = [
  { id: "EXPENSE", label: "Expenses" },
  { id: "INCOME", label: "Income" },
  { id: "TRANSFER", label: "Transfers" },
];

type Params = {
  q: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER" | null;
  range: SearchRange;
  from: string | null;
  to: string | null;
  min: string;
  max: string;
  categoryId: string | null;
  accountId: string | null;
};

function Chip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
        props.active
          ? "bg-brand text-white shadow-sm"
          : "border border-gray-200 bg-white text-gray-600 active:bg-gray-100"
      }`}
    >
      {props.children}
    </button>
  );
}

function RowLabel(props: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {props.children}
    </div>
  );
}

export default function SearchView(
  props: Params & {
    page: number;
    result: SearchResult;
    accounts: PlainAccount[];
    categories: PlainCategory[];
    currency: string;
    locale: string;
    todayIso: string;
  },
) {
  const router = useRouter();
  const { currency, locale, result } = props;
  const fmt = (m: number, sign = false) => formatMoney(m, currency, locale, { sign });

  const [text, setText] = useState(props.q);
  const [minText, setMinText] = useState(props.min);
  const [maxText, setMaxText] = useState(props.max);
  const skipFirst = useRef(true);
  const resetting = useRef(false);

  const [recordDialog, setRecordDialog] = useState<Extract<Entry, { kind: "record" }> | null>(null);
  const [transferDialog, setTransferDialog] = useState<Extract<Entry, { kind: "transfer" }> | null>(
    null,
  );
  const [advOpen, setAdvOpen] = useState(false);

  // Any filter change goes back to page 1; only the pager passes `page`.
  function update(patch: Partial<Params> & { page?: number }) {
    const next: Params = {
      q: patch.q ?? text,
      type: patch.type === undefined ? props.type : patch.type,
      range: patch.range ?? props.range,
      from: patch.from === undefined ? props.from : patch.from,
      to: patch.to === undefined ? props.to : patch.to,
      min: patch.min ?? minText,
      max: patch.max ?? maxText,
      categoryId: patch.categoryId === undefined ? props.categoryId : patch.categoryId,
      accountId: patch.accountId === undefined ? props.accountId : patch.accountId,
    };
    const s = new URLSearchParams();
    if (next.q.trim()) s.set("q", next.q.trim());
    if (next.type) s.set("type", next.type);
    if (next.range !== "month") s.set("range", next.range);
    if (next.range === "custom") {
      if (next.from) s.set("from", next.from);
      if (next.to) s.set("to", next.to);
    }
    if (next.min.trim()) s.set("min", next.min.trim());
    if (next.max.trim()) s.set("max", next.max.trim());
    if (next.categoryId) s.set("category", next.categoryId);
    if (next.accountId) s.set("account", next.accountId);
    if (patch.page && patch.page > 1) s.set("page", String(patch.page));
    const str = s.toString();
    // Jump back to the top when flipping pages; stay put while tweaking filters.
    router.replace(str ? `/search?${str}` : "/search", { scroll: Boolean(patch.page) });
  }

  // Debounced typing: text and amount bounds push into the URL after a pause.
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (resetting.current) return;
    const t = setTimeout(() => update({ q: text, min: minText, max: maxText }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, minText, maxText]);

  // Filters only live within a search session: a fresh document load (refresh,
  // reopened PWA tab, direct link) that carries filter params starts clean.
  // This component stays mounted during in-session filtering, so the effect
  // fires only on genuine page loads.
  useEffect(() => {
    if (window.location.search) {
      resetting.current = true;
      setText("");
      setMinText("");
      setMaxText("");
      router.replace("/search", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The reset is done once the server round-trip lands with clean props;
  // until then the debounce above must not push stale values back.
  useEffect(() => {
    if (
      resetting.current &&
      props.q === "" &&
      props.type === null &&
      props.range === "month" &&
      props.categoryId === null &&
      props.accountId === null &&
      props.min === "" &&
      props.max === ""
    ) {
      resetting.current = false;
    }
  });

  function clearAll() {
    setText("");
    setMinText("");
    setMaxText("");
    skipFirst.current = true; // the state resets above shouldn't re-trigger a push
    router.replace("/search", { scroll: false });
  }

  const activeAccounts = props.accounts.filter((a) => !a.archived);
  const visibleCategories = props.categories.filter(
    (c) =>
      (!c.archived || c.id === props.categoryId) &&
      (props.type === "EXPENSE" || props.type === "INCOME" ? c.type === props.type : true),
  );

  const totalPages = Math.max(1, Math.ceil(result.totalCount / SEARCH_PAGE_SIZE));
  const page = Math.min(props.page, totalPages);
  const firstShown = result.entries.length === 0 ? 0 : (page - 1) * SEARCH_PAGE_SIZE + 1;
  const lastShown = (page - 1) * SEARCH_PAGE_SIZE + result.entries.length;

  const advCount =
    (props.type !== null ? 1 : 0) +
    (props.categoryId !== null ? 1 : 0) +
    (props.accountId !== null ? 1 : 0) +
    (props.min.trim() !== "" || props.max.trim() !== "" ? 1 : 0);
  const hasFilter = advCount > 0 || props.range !== "month" || props.q.trim() !== "";

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-12">
      <header className="pt-safe sticky top-0 z-20 bg-brand shadow-md">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link
            href="/"
            className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-white active:bg-white/20"
            aria-label="Back"
          >
            ‹
          </Link>
          <div className="relative flex-1">
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search notes, categories, accounts…"
              autoFocus
              className="h-11 w-full rounded-lg bg-white px-3 pr-10 text-sm text-gray-800 outline-none placeholder:text-gray-400 [&::-webkit-search-cancel-button]:hidden"
              aria-label="Search records"
            />
            {text && (
              <button
                onClick={() => setText("")}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-base text-gray-400 active:text-gray-600"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Quick filters */}
      <div className="space-y-2.5 px-4 pt-3">
        <div>
          <RowLabel>Time range</RowLabel>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {SEARCH_RANGES.map((r) => (
              <Chip
                key={r.id}
                active={props.range === r.id}
                onClick={() => update({ range: r.id, from: null, to: null })}
              >
                {r.label}
              </Chip>
            ))}
          </div>
          {props.range === "custom" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={props.from ?? ""}
                max={props.todayIso}
                onChange={(e) => update({ from: e.target.value || null })}
                className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand"
                aria-label="From date"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={props.to ?? ""}
                onChange={(e) => update({ to: e.target.value || null })}
                className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand"
                aria-label="To date"
              />
            </div>
          )}
        </div>

        {/* Advanced filters (collapsed by default) */}
        <button
          onClick={() => setAdvOpen((o) => !o)}
          className="flex h-11 w-full items-center justify-between px-1"
          aria-expanded={advOpen}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Advanced filters
            {advCount > 0 && (
              <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                {advCount}
              </span>
            )}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200/70 text-gray-500">
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition-transform ${advOpen ? "" : "-rotate-90"}`}
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
        </button>

        {advOpen && (
        <div>
          <RowLabel>Type</RowLabel>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {TYPES.map((t) => (
              <Chip
                key={t.id}
                active={props.type === t.id}
                onClick={() =>
                  update({
                    type: props.type === t.id ? null : t.id,
                    // a category filter never matches transfers
                    ...(t.id === "TRANSFER" && props.type !== t.id ? { categoryId: null } : {}),
                  })
                }
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
        )}

        {advOpen && (
        <div>
          <RowLabel>Category</RowLabel>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {visibleCategories.map((c) => (
              <Chip
                key={c.id}
                active={props.categoryId === c.id}
                onClick={() =>
                  update({
                    categoryId: props.categoryId === c.id ? null : c.id,
                    ...(props.type === "TRANSFER" ? { type: null } : {}),
                  })
                }
              >
                {c.icon} {c.name}
              </Chip>
            ))}
          </div>
        </div>
        )}

        {advOpen && activeAccounts.length > 1 && (
          <div>
            <RowLabel>Account</RowLabel>
            <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
              {activeAccounts.map((a) => (
                <Chip
                  key={a.id}
                  active={props.accountId === a.id}
                  onClick={() => update({ accountId: props.accountId === a.id ? null : a.id })}
                >
                  {a.icon} {a.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {advOpen && (
        <div>
          <RowLabel>Amount</RowLabel>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              placeholder="Min"
              className="h-10 w-24 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand"
              aria-label="Minimum amount"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
              placeholder="Max"
              className="h-10 w-24 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand"
              aria-label="Maximum amount"
            />
          </div>
        </div>
        )}
      </div>

      {/* Results */}
      <section className="px-4 pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {totalPages > 1
              ? `${firstShown}–${lastShown} of ${result.totalCount.toLocaleString(locale)}`
              : `${result.totalCount} result${result.totalCount === 1 ? "" : "s"}`}
          </h2>
          <span className="flex items-baseline gap-2 text-xs">
            {result.expenseMinor > 0 && (
              <span className="font-semibold text-expense">{fmt(-result.expenseMinor, true)}</span>
            )}
            {result.incomeMinor > 0 && (
              <span className="font-semibold text-income">{fmt(result.incomeMinor, true)}</span>
            )}
            {hasFilter && (
              <button onClick={clearAll} className="font-medium text-brand-dark underline">
                Clear all
              </button>
            )}
          </span>
        </div>
        <EntryList
          entries={result.entries}
          currency={currency}
          locale={locale}
          emptyText={
            hasFilter
              ? "Nothing matches — try fewer filters or a shorter search term."
              : "Nothing here yet. Type to search or tap a filter above."
          }
          onEdit={(entry) =>
            entry.kind === "record" ? setRecordDialog(entry) : setTransferDialog(entry)
          }
        />
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => update({ page: page - 1 })}
              disabled={page <= 1}
              className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 active:bg-gray-100 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="text-xs font-medium text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => update({ page: page + 1 })}
              disabled={page >= totalPages}
              className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 active:bg-gray-100 disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        )}
      </section>

      {recordDialog && (
        <RecordDialog
          key={recordDialog.id}
          initial={{ mode: "edit", entry: recordDialog }}
          accounts={activeAccounts}
          categories={props.categories.filter((c) => !c.archived)}
          currency={currency}
          locale={locale}
          todayIso={props.todayIso}
          defaultAccountId={recordDialog.accountId}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {transferDialog && (
        <TransferDialog
          initial={{ mode: "edit", entry: transferDialog }}
          accounts={activeAccounts}
          todayIso={props.todayIso}
          onClose={() => setTransferDialog(null)}
        />
      )}
    </div>
  );
}
