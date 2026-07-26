"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dashboard as DashboardData, Entry, PlainAccount, PlainCategory } from "@/lib/data";
import { PERIODS, type Period } from "@/lib/periods";
import { formatMoney } from "@/lib/money";
import Donut from "./Donut";
import EntryList from "./EntryList";
import RecordDialog from "./RecordDialog";
import TransferDialog from "./TransferDialog";

/* Horizontal swipe (touch only): axis-locked, never preventDefault so vertical
 * scrolling stays native. Ignores touches starting in the iOS edge-swipe zone. */
function useHorizontalSwipe(enabled: boolean, onSwipe: (dir: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null } | null>(null);
  return {
    onTouchStart(e: React.TouchEvent) {
      start.current = null;
      if (!enabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
      start.current = { x: touch.clientX, y: touch.clientY, t: e.timeStamp, axis: null };
    },
    onTouchMove(e: React.TouchEvent) {
      const s = start.current;
      if (!s || s.axis) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - s.x;
      const dy = touch.clientY - s.y;
      if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) return;
      if (Math.abs(dy) > Math.abs(dx)) start.current = null;
      else s.axis = "x";
    },
    onTouchEnd(e: React.TouchEvent) {
      const s = start.current;
      start.current = null;
      if (!s || s.axis !== "x") return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - s.x;
      const elapsed = e.timeStamp - s.t;
      if (Math.abs(dx) > 50 || (Math.abs(dx) > 30 && elapsed < 250)) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}

export default function Dashboard(props: {
  userName: string;
  isAdmin: boolean;
  currency: string;
  locale: string;
  todayIso: string;
  period: Period;
  offset: number;
  accountId: string | null;
  accounts: PlainAccount[];
  categories: PlainCategory[];
  data: DashboardData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { data, currency, locale } = props;
  const fmt = (m: number, sign = false) => formatMoney(m, currency, locale, { sign });

  const [recordDialog, setRecordDialog] = useState<
    | { mode: "new"; type: "EXPENSE" | "INCOME" }
    | { mode: "edit"; entry: Extract<Entry, { kind: "record" }> }
    | null
  >(null);
  const [transferDialog, setTransferDialog] = useState<
    { mode: "new" } | { mode: "edit"; entry: Extract<Entry, { kind: "transfer" }> } | null
  >(null);
  const [recordsBy, setRecordsBy] = useState<"date" | "category">("date");
  const [lastAccountId, setLastAccountId] = useState<string | null>(null);
  useEffect(() => {
    if (localStorage.getItem("cc.recordsBy") === "category") setRecordsBy("category");
    setLastAccountId(localStorage.getItem("cc.lastAccountId"));
  }, []);
  function addRecord(type: "EXPENSE" | "INCOME") {
    setLastAccountId(localStorage.getItem("cc.lastAccountId"));
    setRecordDialog({ mode: "new", type });
  }
  function switchRecordsBy(by: "date" | "category") {
    localStorage.setItem("cc.recordsBy", by);
    setRecordsBy(by);
  }

  const activeAccounts = useMemo(() => props.accounts.filter((a) => !a.archived), [props.accounts]);
  const rememberedAccountId = activeAccounts.some((a) => a.id === lastAccountId)
    ? lastAccountId
    : null;

  function nav(next: { period?: Period; offset?: number; account?: string | null }) {
    const q = new URLSearchParams();
    const period = next.period ?? props.period;
    const offset = next.offset ?? props.offset;
    const account = next.account === undefined ? props.accountId : next.account;
    if (period !== "month") q.set("period", period);
    if (offset !== 0) q.set("offset", String(offset));
    if (account) q.set("account", account);
    const s = q.toString();
    startTransition(() => router.push(s ? `/?${s}` : "/"));
  }

  const swipe = useHorizontalSwipe(props.period !== "all", (dir) =>
    nav({ offset: props.offset + dir }),
  );

  const netMinor = data.incomeMinor - data.expenseMinor;

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-28">
      {/* Header */}
      <header className="pt-safe sticky top-0 z-20 glass-header text-white shadow-md">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="text-xl">🪙</span>
          <h1 className="text-lg font-bold tracking-wide">CoinCache</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/search"
              className="flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-sm font-medium active:bg-white/30"
            >
              <span className="text-base leading-none" aria-hidden="true">🔍</span>
              Search
            </Link>
            <Link
              href="/settings"
              className="flex h-11 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-sm font-medium active:bg-white/30"
            >
              <span className="text-base leading-none" aria-hidden="true">⚙️</span>
              Settings
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3">
          <select
            value={props.accountId ?? ""}
            onChange={(e) => nav({ account: e.target.value || null })}
            className="h-11 min-w-0 flex-1 rounded-lg bg-brand-dark px-3 text-sm font-medium text-white outline-none"
          >
            <option value="">All accounts</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name} · {fmt(a.balanceMinor)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setTransferDialog({ mode: "new" })}
            className="h-11 rounded-lg bg-brand-dark px-4 text-base font-medium active:bg-brand-darker"
            disabled={activeAccounts.length < 2}
            title="Transfer between accounts"
            aria-label="Transfer between accounts"
          >
            ⇄
          </button>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-white/75">Balance</div>
            <div className="text-sm font-bold">{fmt(data.totalBalanceMinor)}</div>
          </div>
        </div>
      </header>

      {/* Period selector */}
      <nav className="px-4 pt-3">
        <div className="flex rounded-xl bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => nav({ period: p.id, offset: 0 })}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                props.period === p.id ? "bg-brand text-white shadow" : "text-gray-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {props.period !== "all" && (
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={() => nav({ offset: props.offset - 1 })}
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-gray-500 active:bg-gray-200"
              aria-label="Previous period"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-700">{data.rangeLabel}</span>
            <button
              onClick={() => nav({ offset: props.offset + 1 })}
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-gray-500 active:bg-gray-200"
              aria-label="Next period"
            >
              ›
            </button>
          </div>
        )}
      </nav>

      <div {...swipe} className={`transition-opacity ${isPending ? "opacity-60" : ""}`}>
        {/* Donut + summary */}
        <section className="px-4 pt-2">
          <Donut
            slices={data.byCategory}
            centerTop="Expenses"
            centerBottom={fmt(data.expenseMinor)}
          />
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white p-2 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Income</div>
              <div className="text-sm font-bold text-income">{fmt(data.incomeMinor)}</div>
            </div>
            <div className="rounded-xl bg-white p-2 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Expenses</div>
              <div className="text-sm font-bold text-expense">{fmt(data.expenseMinor)}</div>
            </div>
            <div className="rounded-xl bg-white p-2 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Net</div>
              <div className={`text-sm font-bold ${netMinor < 0 ? "text-expense" : "text-income"}`}>
                {fmt(netMinor)}
              </div>
            </div>
          </div>

        </section>

        {/* Records */}
        <section className="px-4 pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Records</h2>
            <div className="flex rounded-lg bg-gray-200/70 p-0.5 text-xs font-medium">
              {(["date", "category"] as const).map((by) => (
                <button
                  key={by}
                  onClick={() => switchRecordsBy(by)}
                  aria-pressed={recordsBy === by}
                  className={`rounded-md px-3 py-1.5 ${
                    recordsBy === by ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
                  }`}
                >
                  {by === "date" ? "By date" : "By category"}
                </button>
              ))}
            </div>
          </div>
          <EntryList
            key={`${recordsBy}:${props.period}:${props.offset}:${props.accountId ?? "all"}`}
            entries={data.entries}
            currency={currency}
            locale={locale}
            groupBy={recordsBy}
            onEdit={(entry) =>
              entry.kind === "record"
                ? setRecordDialog({ mode: "edit", entry })
                : setTransferDialog({ mode: "edit", entry })
            }
          />
        </section>
      </div>

      {/* FABs */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg items-end justify-between px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <button
          onClick={() => addRecord("EXPENSE")}
          className="fab pointer-events-auto bg-expense"
          aria-label="Add expense"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          onClick={() => addRecord("INCOME")}
          className="fab pointer-events-auto bg-income"
          aria-label="Add income"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <line x1="12" y1="5" x2="12" y2="19" />
          </svg>
        </button>
      </div>

      {recordDialog && (
        <RecordDialog
          key={recordDialog.mode === "edit" ? recordDialog.entry.id : recordDialog.type}
          initial={recordDialog}
          accounts={activeAccounts}
          categories={props.categories.filter((c) => !c.archived)}
          currency={currency}
          locale={locale}
          todayIso={props.todayIso}
          defaultAccountId={
            props.accountId ?? rememberedAccountId ?? activeAccounts[0]?.id ?? ""
          }
          onClose={() => setRecordDialog(null)}
        />
      )}
      {transferDialog && (
        <TransferDialog
          initial={transferDialog}
          accounts={activeAccounts}
          todayIso={props.todayIso}
          onClose={() => setTransferDialog(null)}
        />
      )}
    </div>
  );
}
