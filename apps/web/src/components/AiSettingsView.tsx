"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disableAiAction,
  loadAiModelsAction,
  saveAiSettingsAction,
} from "@/lib/ai-actions";

const DEFAULTS: Record<"OLLAMA" | "OPENAI", string> = {
  OLLAMA: "http://host.docker.internal:11434/v1",
  OPENAI: "https://api.openai.com/v1",
};

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export default function AiSettingsView(props: {
  current: {
    provider: "OLLAMA" | "OPENAI";
    baseUrl: string;
    hasKey: boolean;
    model: string | null;
  } | null;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<"OLLAMA" | "OPENAI">(props.current?.provider ?? "OLLAMA");
  const [baseUrl, setBaseUrl] = useState(props.current?.baseUrl ?? DEFAULTS.OLLAMA);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(props.current?.model ? [props.current.model] : []);
  const [model, setModel] = useState(props.current?.model ?? "");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function switchProvider(p: "OLLAMA" | "OPENAI") {
    setProvider(p);
    if (baseUrl === DEFAULTS.OLLAMA || baseUrl === DEFAULTS.OPENAI) setBaseUrl(DEFAULTS[p]);
    setModels([]);
    setModel("");
    setStatus(null);
  }

  function buildForm() {
    const fd = new FormData();
    fd.set("provider", provider);
    fd.set("baseUrl", baseUrl);
    fd.set("apiKey", apiKey);
    return fd;
  }

  function loadModels() {
    setStatus(null);
    startTransition(async () => {
      const res = await loadAiModelsAction(buildForm());
      if (res.ok && res.models) {
        setModels(res.models);
        if (!res.models.includes(model)) setModel(res.models[0]);
        setStatus({ kind: "ok", text: `Connected — ${res.models.length} models available.` });
      } else {
        setStatus({ kind: "err", text: res.error ?? "Connection failed." });
      }
    });
  }

  function save() {
    if (!model) {
      setStatus({ kind: "err", text: "Load models and pick one first." });
      return;
    }
    startTransition(async () => {
      const fd = buildForm();
      fd.set("model", model);
      const res = await saveAiSettingsAction(fd);
      if (res.ok) {
        setApiKey("");
        setStatus({ kind: "ok", text: "Saved. The ✨ button is now available on your dashboard." });
        router.refresh();
      } else {
        setStatus({ kind: "err", text: res.error ?? "Could not save." });
      }
    });
  }

  function disable() {
    if (!confirm("Turn off AI features and delete the stored key?")) return;
    startTransition(async () => {
      await disableAiAction();
      setModels([]);
      setModel("");
      setStatus({ kind: "ok", text: "AI features disabled and key removed." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 px-4 pt-5">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Bring your own AI</h2>
        <p className="text-xs leading-relaxed text-gray-500">
          Connect a local Ollama server (private, free) or your OpenAI account. Everything is
          optional and per-user: your key is encrypted on the server and never sent to the browser,
          and AI is only called when you use an AI feature — your records are never sent anywhere
          in the background.
        </p>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Provider
        </span>
        <div className="mb-3 flex rounded-lg bg-gray-100 p-1">
          {(["OLLAMA", "OPENAI"] as const).map((p) => (
            <button
              key={p}
              onClick={() => switchProvider(p)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
                provider === p ? "bg-white shadow" : "text-gray-500"
              }`}
            >
              {p === "OLLAMA" ? "🦙 Ollama" : "🤖 OpenAI"}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Base URL</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls} />
          {provider === "OLLAMA" && (
            <span className="mt-1 block text-[11px] text-gray-400">
              Ollama running on the same server: keep the default. Elsewhere: http://its-ip:11434/v1
            </span>
          )}
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            API key {provider === "OLLAMA" && "(not needed for Ollama)"}
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={props.current?.hasKey ? "•••••••• (saved — leave blank to keep)" : "sk-…"}
            autoComplete="off"
            className={inputCls}
          />
        </label>

        <button
          onClick={loadModels}
          disabled={pending}
          className="w-full rounded-lg border border-brand py-2 text-sm font-semibold text-brand-dark disabled:opacity-60"
        >
          {pending ? "Connecting…" : "Connect & load models"}
        </button>

        {models.length > 0 && (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}

        {status && (
          <p className={`mt-3 text-sm ${status.kind === "ok" ? "text-income" : "text-red-600"}`}>
            {status.text}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={save}
            disabled={pending || !model}
            className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            Save AI settings
          </button>
          {props.current && (
            <button
              onClick={disable}
              disabled={pending}
              className="rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600"
            >
              Disable
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold">What you get</h2>
        <ul className="space-y-2 text-xs leading-relaxed text-gray-500">
          <li>
            <strong className="text-gray-700">✨ Quick add</strong> — type “chai 20 with friends
            yesterday” on the dashboard and it becomes a ready-to-save record.
          </li>
          <li>
            <strong className="text-gray-700">📷 Receipt scan</strong> — photograph a bill inside
            Quick add; needs a vision-capable model (gpt-4o-mini, llama3.2-vision, llava).
          </li>
          <li>
            <strong className="text-gray-700">💡 Period insights</strong> — “Explain this period”
            on the dashboard writes a short summary of where your money went (only category totals
            are sent, never your records).
          </li>
          <li>
            <strong className="text-gray-700">💬 Ask your data</strong> — questions like “how much
            on Bills last month?”; the AI only translates your question, the numbers are computed
            from your data on this server.
          </li>
          <li>
            <strong className="text-gray-700">🗂 Import matching</strong> — during CSV import,
            unknown categories are matched onto your existing ones, with a review step.
          </li>
          <li>
            <strong className="text-gray-700">Coming next</strong> — unusual-spend alerts,
            recurring-expense detection, budget coach. See AI_ROADMAP.md in the repository.
          </li>
        </ul>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Privacy note: when you use an AI feature, the text you type plus your category and
          account <em>names</em> are sent to the provider you configured above. With Ollama on
          your own server, nothing ever leaves your machine.
        </p>
      </div>
    </div>
  );
}
