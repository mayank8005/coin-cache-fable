"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { aiAskAction } from "@/lib/ai-actions";

type Message = { role: "q" | "a"; text: string; error?: boolean };

const SUGGESTIONS = [
  "How much did I spend this month?",
  "Where did my money go this year?",
  "What are my account balances?",
  "Spending on Eating out, month by month?",
];

export default function AssistantView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "q", text: q }]);
    startTransition(async () => {
      const res = await aiAskAction(q);
      setMessages((m) => [
        ...m,
        res.ok && res.answer
          ? { role: "a", text: res.answer }
          : { role: "a", text: res.error ?? "Something went wrong.", error: true },
      ]);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="pt-6">
            <p className="mb-3 text-center text-sm text-gray-400">
              Ask about your own records — answers are computed from your data on the server; the AI
              only translates the question.
            </p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="block w-full rounded-xl bg-white px-4 py-2.5 text-left text-sm text-gray-600 shadow-sm active:bg-gray-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "q" ? (
            <div key={i} className="ml-10 rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-white">
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className={`mr-10 whitespace-pre-wrap rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm shadow-sm ${
                m.error ? "bg-red-50 text-red-700" : "bg-white text-gray-800"
              }`}
            >
              {m.text}
            </div>
          ),
        )}
        {pending && <div className="mr-10 rounded-2xl bg-white px-4 py-2.5 text-sm text-gray-400 shadow-sm">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="pb-safe sticky bottom-0 flex gap-2 border-t border-gray-100 bg-surface px-4 py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. how much on Bills last month?"
          maxLength={300}
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-base outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={pending || input.trim().length < 3}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-60"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
