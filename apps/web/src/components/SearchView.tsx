"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Entry, PlainAccount, PlainCategory, SearchResult } from "@/lib/data";
import {
  MAX_PERIOD_OFFSET,
  SEARCH_PAGE_SIZE,
  SEARCH_RANGES,
  type SearchRange,
} from "@/lib/periods";
import {
  DEFAULT_SEARCH_BY,
  SEARCH_BY_FIELDS,
  isDefaultSearchBy,
  serializeSearchBy,
  type SearchByField,
} from "@/lib/search";
import { formatMoney, parseAmountMinor } from "@/lib/money";
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
  searchBy: SearchByField[];
  /** Part of the optimistic set too, so a double-tap on the pager composes. */
  page: number;
};

function Chip(props: {
  active: boolean;
  /** Active and un-toggleable: still clickable, but the click does nothing. */
  locked?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      aria-disabled={props.locked ? true : undefined}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
        props.active
          ? "bg-brand text-white shadow-sm"
          : "border border-gray-200 bg-white text-gray-600 active:bg-gray-100"
      }${props.locked ? " cursor-default opacity-60" : ""}`}
    >
      {props.children}
    </button>
  );
}

function buildQuery(p: Params): string {
  const s = new URLSearchParams();
  if (p.q.trim()) s.set("q", p.q.trim());
  if (p.type) s.set("type", p.type);
  if (p.range !== "month") s.set("range", p.range);
  if (p.range === "custom") {
    if (p.from) s.set("from", p.from);
    if (p.to) s.set("to", p.to);
  }
  if (p.min.trim()) s.set("min", p.min.trim());
  if (p.max.trim()) s.set("max", p.max.trim());
  if (p.categoryId) s.set("category", p.categoryId);
  if (p.accountId) s.set("account", p.accountId);
  if (!isDefaultSearchBy(p.searchBy)) s.set("by", serializeSearchBy(p.searchBy));
  if (p.page > 1) s.set("page", String(p.page));
  return s.toString();
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

  const [recordDialog, setRecordDialog] = useState<Extract<Entry, { kind: "record" }> | null>(null);
  const [transferDialog, setTransferDialog] = useState<Extract<Entry, { kind: "transfer" }> | null>(
    null,
  );
  const [advOpen, setAdvOpen] = useState(false);

  const fromProps: Params = {
    q: props.q,
    type: props.type,
    range: props.range,
    from: props.from,
    to: props.to,
    min: props.min,
    max: props.max,
    categoryId: props.categoryId,
    accountId: props.accountId,
    searchBy: props.searchBy,
    page: props.page,
  };

  // Props only catch up after a server round-trip, so a filter change made in
  // the last few hundred ms isn't visible in them yet. `pending` is what we
  // last asked for; every filter read goes through it, and it is dropped once
  // the server state settles on it (or moves somewhere else entirely).
  const [pending, setPending] = useState<Params | null>(null);
  // Mirrors the state for read-your-writes: two taps in the same tick both have
  // to compose, and the second one runs before React has re-rendered.
  const pendingRef = useRef<Params | null>(null);
  const propsRef = useRef(fromProps);
  const lastPropsKey = useRef<string | null>(null);
  const propsKey = buildQuery(fromProps);
  const live = pending ?? fromProps;

  /** The newest params anyone has asked for — never a render-phase snapshot. */
  function liveParams(): Params {
    return pendingRef.current ?? propsRef.current;
  }

  function setLive(next: Params | null) {
    pendingRef.current = next;
    setPending(next);
  }

  // Reconcile the optimistic copy with the server on every commit: our push
  // landed (settled), or something else navigated (moved) — either way props
  // are authoritative again.
  useEffect(() => {
    propsRef.current = fromProps;
    const moved = lastPropsKey.current !== null && lastPropsKey.current !== propsKey;
    lastPropsKey.current = propsKey;
    if (!pendingRef.current) return;
    if (moved || buildQuery(pendingRef.current) === propsKey) setLive(null);
  });

  // Any filter change goes back to page 1; only the pager passes `page`.
  function update(patch: Partial<Params>) {
    const base = liveParams();
    const next: Params = {
      // Text state is never read here: it reaches the URL through the debounce
      // (which passes all three explicitly), so a tap right after a reset can't
      // resurrect text the reset just cleared.
      q: patch.q ?? base.q,
      type: patch.type === undefined ? base.type : patch.type,
      range: patch.range ?? base.range,
      from: patch.from === undefined ? base.from : patch.from,
      to: patch.to === undefined ? base.to : patch.to,
      min: patch.min ?? base.min,
      max: patch.max ?? base.max,
      categoryId: patch.categoryId === undefined ? base.categoryId : patch.categoryId,
      accountId: patch.accountId === undefined ? base.accountId : patch.accountId,
      searchBy: patch.searchBy ?? base.searchBy,
      page: patch.page ?? 1,
    };
    setLive(next);
    const str = buildQuery(next);
    // Jump back to the top when flipping pages; stay put while tweaking filters.
    router.replace(str ? `/search?${str}` : "/search", { scroll: Boolean(patch.page) });
  }

  // Debounced typing: text and amount bounds push into the URL after a pause.
  // Pushing only when they differ from the live params keeps mount and reset
  // from firing a redundant navigation, without ever swallowing a keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const base = liveParams();
      if (
        text.trim() === base.q.trim() &&
        minText.trim() === base.min.trim() &&
        maxText.trim() === base.max.trim()
      )
        return;
      update({ q: text, min: minText, max: maxText });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, minText, maxText]);

  /** Every filter back to its default — the shape both reset paths land on. */
  function clearedParams(): Params {
    return {
      q: "",
      type: null,
      range: "month",
      from: null,
      to: null,
      min: "",
      max: "",
      categoryId: null,
      accountId: null,
      searchBy: [...DEFAULT_SEARCH_BY],
      page: 1,
    };
  }

  function reset() {
    setText("");
    setMinText("");
    setMaxText("");
    // A concrete cleared copy rather than null: the chips read as cleared right
    // away, and anything tapped before the round-trip lands composes on top of
    // the cleared state instead of resurrecting the filters we just dropped.
    setLive(clearedParams());
    router.replace("/search", { scroll: false });
  }

  // Filters only live within a search session: a fresh document load (refresh,
  // reopened PWA tab, direct link) that carries filter params starts clean.
  // This component stays mounted during in-session filtering, so the effect
  // fires only on genuine page loads.
  useEffect(() => {
    if (window.location.search) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // At least one field must stay on, so un-toggling the last one is a no-op
  // (the chip renders as aria-disabled to explain the dead click).
  function toggleSearchBy(id: SearchByField) {
    const current = liveParams().searchBy;
    const active = current.includes(id);
    if (active && current.length === 1) return;
    update({ searchBy: active ? current.filter((f) => f !== id) : [...current, id] });
  }

  function toggleType(id: "EXPENSE" | "INCOME" | "TRANSFER") {
    const base = liveParams();
    const next = base.type === id ? null : id;
    const selected = props.categories.find((c) => c.id === base.categoryId);
    // A category filter never matches transfers, and an expense category never
    // matches income: either way the chip would vanish from the row below while
    // still filtering, leaving no way to switch it off.
    const dropCategory =
      next === "TRANSFER" ||
      ((next === "EXPENSE" || next === "INCOME") && selected != null && selected.type !== next);
    update({ type: next, ...(dropCategory ? { categoryId: null } : {}) });
  }

  function toggleCategory(id: string) {
    const base = liveParams();
    update({
      categoryId: base.categoryId === id ? null : id,
      ...(base.type === "TRANSFER" ? { type: null } : {}),
    });
  }

  const activeAccounts = props.accounts.filter((a) => !a.archived);
  const visibleCategories = props.categories.filter(
    (c) =>
      (!c.archived || c.id === live.categoryId) &&
      (live.type === "EXPENSE" || live.type === "INCOME" ? c.type === live.type : true),
  );

  const totalPages = Math.max(1, Math.ceil(result.totalCount / SEARCH_PAGE_SIZE));
  const page = Math.min(live.page, totalPages);
  // The rows on screen belong to the page the server actually served, so the
  // "X–Y of Z" line is computed from that — pairing an optimistic page with the
  // previous page's rows reads as "401–600 of 409" mid-flight.
  const settledOffset = (result.page - 1) * SEARCH_PAGE_SIZE;
  const firstShown = result.entries.length === 0 ? 0 : settledOffset + 1;
  const lastShown = Math.min(result.totalCount, settledOffset + result.entries.length);

  /**
   * Prev steps from the clamped page so it still moves after the result set
   * shrank under an out-of-range live page — that clamp is the whole fix for a
   * dead first Prev tap.
   *
   * Next deliberately skips the upper clamp: `totalPages` describes the settled
   * (possibly narrower) result, so clamping against it could pin a tap made
   * while a widening filter is still in flight. Defensive only — the
   * `disabled={page >= totalPages}` guard below blocks the tap in exactly the
   * cases where the clamp would have bitten, so it is not observable through
   * the UI (see the note on the pager tests).
   */
  function stepPage(delta: number) {
    const livePage = liveParams().page;
    const next =
      delta < 0 ? Math.max(1, Math.min(livePage, totalPages) + delta) : livePage + delta;
    update({ page: next });
  }

  // Counted off `live` so the badge reflects a just-tapped filter instead of
  // lagging a server round-trip behind it.
  const advCount =
    (live.type !== null ? 1 : 0) +
    (live.categoryId !== null ? 1 : 0) +
    (live.accountId !== null ? 1 : 0) +
    // Only bounds the server will actually apply — an unparseable one is
    // dropped there, and a badge for a filter that isn't filtering is a lie.
    (parseAmountMinor(live.min) !== null || parseAmountMinor(live.max) !== null ? 1 : 0) +
    (isDefaultSearchBy(live.searchBy) ? 0 : 1);
  // Raw text, not the parsed bound: a value the server rejects filters nothing
  // and lights no badge, so "Clear all" is the only way back out of it.
  const hasFilter =
    advCount > 0 ||
    live.range !== "month" ||
    live.q.trim() !== "" ||
    live.min.trim() !== "" ||
    live.max.trim() !== "";

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
              placeholder="Search description or amount…"
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
                active={live.range === r.id}
                onClick={() => update({ range: r.id, from: null, to: null })}
              >
                {r.label}
              </Chip>
            ))}
          </div>
          {live.range === "custom" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={live.from ?? ""}
                max={props.todayIso}
                onChange={(e) => update({ from: e.target.value || null })}
                className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-brand"
                aria-label="From date"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={live.to ?? ""}
                max={props.todayIso}
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
          <RowLabel>Search by</RowLabel>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {SEARCH_BY_FIELDS.map((f) => (
              <Chip
                key={f.id}
                active={live.searchBy.includes(f.id)}
                locked={live.searchBy.length === 1 && live.searchBy[0] === f.id}
                onClick={() => toggleSearchBy(f.id)}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </div>
        )}

        {advOpen && (
        <div>
          <RowLabel>Type</RowLabel>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
            {TYPES.map((t) => (
              <Chip
                key={t.id}
                active={live.type === t.id}
                onClick={() => toggleType(t.id)}
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
                active={live.categoryId === c.id}
                onClick={() => toggleCategory(c.id)}
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
                  active={live.accountId === a.id}
                  onClick={() =>
                    update({ accountId: liveParams().accountId === a.id ? null : a.id })
                  }
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
              ? `${firstShown.toLocaleString(locale)}–${lastShown.toLocaleString(locale)} of ${result.totalCount.toLocaleString(locale)}`
              : `${result.totalCount.toLocaleString(locale)} result${
                  result.totalCount === 1 ? "" : "s"
                }`}
          </h2>
          <span className="flex items-baseline gap-2 text-xs">
            {result.expenseMinor > 0 && (
              <span className="font-semibold text-expense">{fmt(-result.expenseMinor, true)}</span>
            )}
            {result.incomeMinor > 0 && (
              <span className="font-semibold text-income">{fmt(result.incomeMinor, true)}</span>
            )}
            {hasFilter && (
              <button onClick={reset} className="font-medium text-brand-dark underline">
                Clear all
              </button>
            )}
          </span>
        </div>
        <EntryList
          entries={result.entries}
          currency={currency}
          locale={locale}
          groupBy="month"
          defaultExpanded
          showProgressBar={false}
          headerAction={({ key, label }) => {
            // Month key is "YYYY-MM"; the home page takes a relative offset.
            const [y, m] = key.split("-").map(Number);
            const [ty, tm] = props.todayIso.split("-").map(Number);
            // The dashboard clamps the same way; an unclamped offset would
            // silently land on a different month.
            const offset = Math.max(
              -MAX_PERIOD_OFFSET,
              Math.min(MAX_PERIOD_OFFSET, (y - ty) * 12 + (m - tm)),
            );
            return (
              <Link
                href={offset === 0 ? "/" : `/?offset=${offset}`}
                aria-label={`Go to ${label}`}
                className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="4" y1="12" x2="18" y2="12" />
                  <polyline points="12 6 18 12 12 18" />
                </svg>
              </Link>
            );
          }}
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
              onClick={() => stepPage(-1)}
              disabled={page <= 1}
              className="flex h-11 items-center rounded-lg border border-gray-200 bg-white px-5 text-sm font-medium text-gray-600 active:bg-gray-100 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="text-xs font-medium text-gray-500">
              Page {page.toLocaleString(locale)} of {totalPages.toLocaleString(locale)}
            </span>
            <button
              onClick={() => stepPage(1)}
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
