"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlainAccount, PlainCategory } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { aiQuickAddAction } from "@/lib/ai-actions";
import { saveRecordAction } from "@/lib/actions";

type Proposal = {
  type: "EXPENSE" | "INCOME";
  amountMinor: number;
  categoryId: string;
  accountId: string;
  date: string;
  note: string;
};

export default function QuickAddDialog(props: {
  accounts: PlainAccount[];
  categories: PlainCategory[];
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function parse() {
    setError(null);
    startTransition(async () => {
      const res = await aiQuickAddAction(text);
      if (res.ok && res.proposal) setProposal(res.proposal);
      else setError(res.error ?? "Could not understand that.");
    });
  }

  function save() {
    if (!proposal) return;
    startTransition(async () => {
      const res = await saveRecordAction(proposal);
      if (res.ok) {
        props.onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Could not save.");
      }
    });
  }

  const categories = proposal
    ? props.categories.filter((c) => !c.archived && c.type === proposal.type)
    : [];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center" onClick={props.onClose}>
      <div
        className="pb-safe w-full max-w-lg rounded-t-2xl bg-surface p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">✨ Quick add</h2>
          <button onClick={props.onClose} className="text-2xl leading-none text-gray-400" aria-label="Close">
            ×
          </button>
        </div>

        {!proposal ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder='e.g. "auto to office 45", "groceries 1200 by card", "salary 50k"'
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base outline-none focus:border-brand"
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              onClick={parse}
              disabled={pending || text.trim().length < 2}
              className="mt-3 w-full rounded-xl bg-brand py-3 text-base font-semibold text-white shadow disabled:opacity-60"
            >
              {pending ? "Thinking…" : "Parse with AI"}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div
              className={`rounded-xl px-4 py-3 text-center text-2xl font-bold text-white ${
                proposal.type === "EXPENSE" ? "bg-expense" : "bg-income"
              }`}
            >
              {proposal.type === "EXPENSE" ? "−" : "+"}
              {formatMoney(proposal.amountMinor, props.currency, props.locale)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={proposal.categoryId}
                onChange={(e) => setProposal({ ...proposal, categoryId: e.target.value })}
                className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              <select
                value={proposal.accountId}
                onChange={(e) => setProposal({ ...proposal, accountId: e.target.value })}
                className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
              >
                {props.accounts
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={proposal.date}
                onChange={(e) => setProposal({ ...proposal, date: e.target.value })}
                className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
              />
              <input
                type="text"
                value={proposal.note}
                placeholder="Note"
                maxLength={500}
                onChange={(e) => setProposal({ ...proposal, note: e.target.value })}
                className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setProposal(null)}
                disabled={pending}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600"
              >
                ‹ Edit text
              </button>
              <button
                onClick={save}
                disabled={pending}
                className="flex-1 rounded-xl bg-brand py-3 text-base font-semibold text-white shadow disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save record"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
