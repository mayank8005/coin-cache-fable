"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dashboard as DashboardData, Entry, PlainAccount, PlainCategory } from "@/lib/data";
import { PERIODS, type Period } from "@/lib/periods";
import { formatMoney } from "@/lib/money";
import { logoutAction } from "@/lib/actions";
import Donut from "./Donut";
import EntryList from "./EntryList";
import RecordDialog from "./RecordDialog";
import TransferDialog from "./TransferDialog";
import QuickAddDialog from "./QuickAddDialog";

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
  aiEnabled: boolean;
}) {
  const router = useRouter();
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
  const [query, setQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.entries;
    return data.entries.filter((e) => {
      const hay =
        e.kind === "record"
          ? `${e.categoryName} ${e.note} ${e.accountName}`
          : `transfer ${e.note} ${e.fromAccountName} ${e.toAccountName}`;
      return hay.toLowerCase().includes(q);
    });
  }, [data.entries, query]);

  const activeAccounts = useMemo(() => props.accounts.filter((a) => !a.archived), [props.accounts]);

  function nav(next: { period?: Period; offset?: number; account?: string | null }) {
    const q = new URLSearchParams();
    const period = next.period ?? props.period;
    const offset = next.offset ?? props.offset;
    const account = next.account === undefined ? props.accountId : next.account;
    if (period !== "month") q.set("period", period);
    if (offset !== 0) q.set("offset", String(offset));
    if (account) q.set("account", account);
    const s = q.toString();
    router.push(s ? `/?${s}` : "/");
  }

  const netMinor = data.incomeMinor - data.expenseMinor;

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-28">
      {/* Header */}
      <header className="pt-safe sticky top-0 z-20 bg-brand text-white shadow-md">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="text-xl">🪙</span>
          <h1 className="text-lg font-bold tracking-wide">CoinCache</h1>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/settings"
              className="rounded-full p-2 text-xl leading-none hover:bg-white/15"
              aria-label="Settings"
            >
              ⚙️
            </Link>
            <form action={logoutAction}>
              <button
                className="rounded-full p-2 text-sm font-medium hover:bg-white/15"
                title={`Sign out ${props.userName}`}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3">
          <select
            value={props.accountId ?? ""}
            onChange={(e) => nav({ account: e.target.value || null })}
            className="min-w-0 flex-1 rounded-lg bg-brand-dark px-3 py-2 text-sm font-medium text-white outline-none"
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
            className="rounded-lg bg-brand-dark px-3 py-2 text-sm font-medium hover:bg-brand-darker"
            disabled={activeAccounts.length < 2}
            title="Transfer between accounts"
          >
            ⇄
          </button>
          {props.aiEnabled && (
            <button
              onClick={() => setQuickAddOpen(true)}
              className="rounded-lg bg-brand-dark px-3 py-2 text-sm font-medium hover:bg-brand-darker"
              title="AI quick add"
            >
              ✨
            </button>
          )}
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
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${
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
              className="rounded-full px-4 py-1 text-xl text-gray-500 active:bg-gray-200"
              aria-label="Previous period"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-700">{data.rangeLabel}</span>
            <button
              onClick={() => nav({ offset: props.offset + 1 })}
              className="rounded-full px-4 py-1 text-xl text-gray-500 active:bg-gray-200"
              aria-label="Next period"
            >
              ›
            </button>
          </div>
        )}
      </nav>

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

        {/* Category breakdown */}
        {data.byCategory.length > 0 && (
          <ul className="mt-3 space-y-1">
            {data.byCategory.map((s) => (
              <li key={s.categoryId} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none"
                  style={{ backgroundColor: s.color + "26" }}
                >
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    <span className="text-sm font-semibold">{fmt(s.amountMinor)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, s.share * 100)}%`, backgroundColor: s.color }}
                    />
                  </div>
                </div>
                <span className="w-10 shrink-0 text-right text-xs text-gray-400">
                  {(s.share * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Records */}
      <section className="px-4 pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Records</h2>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Search"
            className="w-40 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
            aria-label="Search records"
          />
        </div>
        {query && (
          <p className="mb-2 text-xs text-gray-400">
            {filteredEntries.length} match{filteredEntries.length === 1 ? "" : "es"} in this period
          </p>
        )}
        <EntryList
          entries={filteredEntries}
          currency={currency}
          locale={locale}
          onEdit={(entry) =>
            entry.kind === "record"
              ? setRecordDialog({ mode: "edit", entry })
              : setTransferDialog({ mode: "edit", entry })
          }
        />
      </section>

      {/* FABs */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg items-end justify-between px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <button
          onClick={() => setRecordDialog({ mode: "new", type: "EXPENSE" })}
          className="fab pointer-events-auto bg-expense"
          aria-label="Add expense"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          onClick={() => setRecordDialog({ mode: "new", type: "INCOME" })}
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
          defaultAccountId={props.accountId ?? activeAccounts[0]?.id ?? ""}
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
      {quickAddOpen && (
        <QuickAddDialog
          accounts={props.accounts}
          categories={props.categories}
          currency={currency}
          locale={locale}
          onClose={() => setQuickAddOpen(false)}
        />
      )}
    </div>
  );
}
