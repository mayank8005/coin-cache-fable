"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Entry, PlainAccount } from "@/lib/data";
import { deleteTransferAction, saveTransferAction } from "@/lib/actions";

export default function TransferDialog(props: {
  initial: { mode: "new" } | { mode: "edit"; entry: Extract<Entry, { kind: "transfer" }> };
  accounts: PlainAccount[];
  todayIso: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const edit = props.initial.mode === "edit" ? props.initial.entry : null;
  const [from, setFrom] = useState(edit?.fromAccountId ?? props.accounts[0]?.id ?? "");
  const [to, setTo] = useState(edit?.toAccountId ?? props.accounts[1]?.id ?? "");
  const [amount, setAmount] = useState(edit ? String(edit.amountMinor / 100) : "");
  const [date, setDate] = useState(edit?.date ?? props.todayIso);
  const [note, setNote] = useState(edit?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const amountMinor = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    startTransition(async () => {
      const res = await saveTransferAction({
        id: edit?.id,
        amountMinor,
        date,
        note,
        fromAccountId: from,
        toAccountId: to,
      });
      if (res.ok) {
        props.onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  function remove() {
    if (!edit || !confirm("Delete this transfer?")) return;
    startTransition(async () => {
      await deleteTransferAction(edit.id);
      props.onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center" onClick={props.onClose}>
      <div
        className="pb-safe w-full max-w-lg rounded-t-2xl bg-surface p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{edit ? "Edit transfer" : "Transfer"}</h2>
          <button
            onClick={props.onClose}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-3xl leading-none text-gray-400 active:bg-gray-200"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">From</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2">
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-gray-500">To</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2">
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Note (optional)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            {edit && (
              <button
                onClick={remove}
                disabled={pending}
                className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600"
              >
                Delete
              </button>
            )}
            <button
              onClick={save}
              disabled={pending}
              className="flex-1 rounded-xl bg-brand py-3 text-base font-semibold text-white shadow disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save transfer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
