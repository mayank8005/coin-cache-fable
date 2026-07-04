"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Entry, PlainAccount, PlainCategory } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { deleteRecordAction, saveRecordAction } from "@/lib/actions";

type Op = "+" | "-" | "*" | "/";

type Calc = { acc: number | null; op: Op | null; cur: string };

function evaluate(c: Calc): number {
  const cur = parseFloat(c.cur || "0") || 0;
  if (c.acc === null || c.op === null) return cur;
  switch (c.op) {
    case "+":
      return c.acc + cur;
    case "-":
      return c.acc - cur;
    case "*":
      return c.acc * cur;
    case "/":
      return cur === 0 ? c.acc : c.acc / cur;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const OP_LABEL: Record<Op, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export default function RecordDialog(props: {
  initial:
    | { mode: "new"; type: "EXPENSE" | "INCOME" }
    | { mode: "edit"; entry: Extract<Entry, { kind: "record" }> };
  accounts: PlainAccount[];
  categories: PlainCategory[];
  currency: string;
  locale: string;
  todayIso: string;
  defaultAccountId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const editEntry = props.initial.mode === "edit" ? props.initial.entry : null;
  const [type, setType] = useState<"EXPENSE" | "INCOME">(
    editEntry ? editEntry.type : props.initial.mode === "new" ? props.initial.type : "EXPENSE",
  );
  const [calc, setCalc] = useState<Calc>({
    acc: null,
    op: null,
    cur: editEntry ? String(editEntry.amountMinor / 100) : "",
  });
  const [note, setNote] = useState(editEntry?.note ?? "");
  const [date, setDate] = useState(editEntry?.date ?? props.todayIso);
  const [accountId, setAccountId] = useState(editEntry?.accountId ?? props.defaultAccountId);
  const [step, setStep] = useState<"amount" | "category">("amount");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const value = round2(evaluate(calc));
  const amountMinor = Math.round(value * 100);
  const categories = props.categories.filter((c) => c.type === type);

  function press(key: string) {
    setError(null);
    setCalc((c) => {
      if (key === "back") {
        if (c.cur) return { ...c, cur: c.cur.slice(0, -1) };
        if (c.op) return { ...c, op: null, cur: c.acc !== null ? String(c.acc) : "", acc: null };
        return c;
      }
      if (key === "=") {
        return { acc: null, op: null, cur: String(round2(evaluate(c))) };
      }
      if (key === "+" || key === "-" || key === "*" || key === "/") {
        return { acc: round2(evaluate(c)), op: key, cur: "" };
      }
      if (key === ".") {
        if (c.cur.includes(".")) return c;
        return { ...c, cur: (c.cur || "0") + "." };
      }
      // digit
      if (c.cur.replace(".", "").length >= 10) return c;
      if (c.cur === "0") return { ...c, cur: key };
      return { ...c, cur: c.cur + key };
    });
  }

  function save(categoryId: string) {
    if (amountMinor <= 0) {
      setError("Enter an amount first.");
      setStep("amount");
      return;
    }
    startTransition(async () => {
      const res = await saveRecordAction({
        id: editEntry?.id,
        type,
        amountMinor,
        date,
        note,
        accountId,
        categoryId,
      });
      if (res.ok) {
        props.onClose();
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
        setStep("amount");
      }
    });
  }

  function remove() {
    if (!editEntry || !confirm("Delete this record?")) return;
    startTransition(async () => {
      await deleteRecordAction(editEntry.id);
      props.onClose();
      router.refresh();
    });
  }

  const displayExpr =
    calc.acc !== null && calc.op !== null
      ? `${calc.acc} ${OP_LABEL[calc.op]} ${calc.cur || "…"}`
      : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center" onClick={props.onClose}>
      <div
        className="pb-safe w-full max-w-lg rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          className={`flex items-center justify-between rounded-t-2xl px-4 py-3 text-white ${
            type === "EXPENSE" ? "bg-expense" : "bg-income"
          }`}
        >
          <button
            onClick={props.onClose}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-3xl leading-none active:bg-black/15"
            aria-label="Close"
          >
            ×
          </button>
          <div className="flex gap-1 rounded-lg bg-black/15 p-0.5 text-sm font-medium">
            <button
              onClick={() => setType("EXPENSE")}
              className={`rounded-md px-3 py-1.5 ${type === "EXPENSE" ? "bg-white text-expense" : ""}`}
            >
              Expense
            </button>
            <button
              onClick={() => setType("INCOME")}
              className={`rounded-md px-3 py-1.5 ${type === "INCOME" ? "bg-white text-income" : ""}`}
            >
              Income
            </button>
          </div>
          {editEntry ? (
            <button
              onClick={remove}
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-xl active:bg-black/15"
              aria-label="Delete record"
              disabled={pending}
            >
              🗑️
            </button>
          ) : (
            <span className="w-9" />
          )}
        </div>

        {step === "amount" ? (
          <div className="p-4">
            {/* Amount display */}
            <div className="mb-3 rounded-xl bg-white px-4 py-3 text-right shadow-sm">
              {displayExpr && <div className="text-xs text-gray-400">{displayExpr}</div>}
              <div className="text-3xl font-bold tabular-nums">
                {formatMoney(amountMinor, props.currency, props.locale)}
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
              >
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.icon} {a.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
              />
            </div>
            <input
              type="text"
              placeholder="Note (optional)"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            />

            {/* Keypad */}
            <div className="grid grid-cols-4 gap-2">
              {["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", ".", "0", "back", "+"].map(
                (k) => (
                  <button
                    key={k}
                    onClick={() => press(k)}
                    className={`keypad-btn ${"+-*/".includes(k) ? "text-brand-dark" : ""}`}
                  >
                    {k === "back" ? "⌫" : k === "/" ? "÷" : k === "*" ? "×" : k === "-" ? "−" : k}
                  </button>
                ),
              )}
            </div>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <button
              onClick={() => {
                if (calc.op !== null) press("=");
                else if (amountMinor > 0) setStep("category");
                else setError("Enter an amount first.");
              }}
              disabled={pending}
              className={`mt-3 w-full rounded-xl py-3 text-base font-semibold text-white shadow ${
                type === "EXPENSE" ? "bg-expense" : "bg-income"
              } disabled:opacity-60`}
            >
              {calc.op !== null ? "=" : "Choose category"}
            </button>
          </div>
        ) : (
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => setStep("amount")}
                className="-ml-3 flex h-11 items-center rounded-full px-3 text-sm font-medium text-gray-500 active:bg-gray-200"
              >
                ‹ Back
              </button>
              <span className="text-lg font-bold">
                {formatMoney(amountMinor, props.currency, props.locale)}
              </span>
            </div>
            <div className="grid max-h-[50dvh] grid-cols-4 gap-2 overflow-y-auto">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => save(c.id)}
                  disabled={pending}
                  className={`flex flex-col items-center gap-1 rounded-xl bg-white p-2 py-3 shadow-sm active:scale-95 ${
                    editEntry?.categoryId === c.id ? "ring-2 ring-brand" : ""
                  }`}
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none"
                    style={{ backgroundColor: c.color + "33" }}
                  >
                    {c.icon}
                  </span>
                  <span className="w-full truncate text-center text-[11px] font-medium text-gray-600">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
            {categories.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                No {type.toLowerCase()} categories yet — add one in Settings.
              </p>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            {pending && <p className="mt-2 text-center text-sm text-gray-400">Saving…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
