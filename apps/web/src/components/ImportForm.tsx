"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importCsvAction, type ImportResult } from "@/lib/actions";

export default function ImportForm(props: { aiEnabled?: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function buildFormData(withMapping: boolean): FormData | null {
    const form = formRef.current;
    const file = fileRef.current?.files?.[0];
    if (!form || !file) return null;
    const fd = new FormData(form);
    fd.set("file", file);
    if (withMapping) fd.set("mapping", JSON.stringify(mapping));
    return fd;
  }

  function submit(withMapping: boolean) {
    const fd = buildFormData(withMapping);
    if (!fd) return;
    startTransition(async () => {
      const res = await importCsvAction(fd);
      setResult(res);
      if (res.ok && res.phase === "mapping" && res.unknowns) {
        setMapping(
          Object.fromEntries(res.unknowns.map((u) => [`${u.type}:${u.name.toLowerCase()}`, u.suggestion])),
        );
      }
      if (res.ok && !res.phase) router.refresh();
    });
  }

  const inMappingPhase = result?.ok && result.phase === "mapping" && result.unknowns;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-2"
    >
      <input
        ref={fileRef}
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Dates in file:</span>
          <select name="dateOrder" defaultValue="auto" className="rounded-lg border border-gray-200 px-2 py-1 text-sm">
            <option value="auto">Auto-detect</option>
            <option value="DMY">Day/Month/Year</option>
            <option value="MDY">Month/Day/Year</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" name="skipDuplicates" defaultChecked className="accent-brand" />
          Skip duplicates
        </label>
        {props.aiEnabled && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" name="aiMap" defaultChecked className="accent-brand" />
            ✨ AI category matching
          </label>
        )}
      </div>

      {!inMappingPhase && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {pending ? "Working…" : "Import CSV"}
        </button>
      )}

      {inMappingPhase && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <p className="mb-2 font-medium">
            {result!.unknowns!.length} unknown categor{result!.unknowns!.length === 1 ? "y" : "ies"} —
            review where each should go:
          </p>
          <ul className="space-y-1.5">
            {result!.unknowns!.map((u) => {
              const key = `${u.type}:${u.name.toLowerCase()}`;
              const options = result!.categoryOptions?.[u.type] ?? [];
              return (
                <li key={key} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {u.name} <span className="text-blue-400">({u.type.toLowerCase()})</span>
                  </span>
                  <span>→</span>
                  <select
                    value={mapping[key] ?? "__NEW__"}
                    onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                    className="rounded-md border border-blue-200 bg-white px-2 py-1"
                  >
                    <option value="__NEW__">Create “{u.name}”</option>
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={pending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {pending ? "Importing…" : "Confirm & import"}
            </button>
            <button type="button" onClick={() => setResult(null)} className="px-2 text-sm text-gray-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && !result.phase && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            result.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          {result.ok ? (
            <>
              <p className="font-medium">Imported {result.imported} records.</p>
              {result.skippedDuplicates ? <p>Skipped {result.skippedDuplicates} duplicates.</p> : null}
              {result.createdAccounts?.length ? <p>New accounts: {result.createdAccounts.join(", ")}</p> : null}
              {result.createdCategories?.length ? (
                <p>New categories: {result.createdCategories.join(", ")}</p>
              ) : null}
              {result.dateOrderAmbiguous && (
                <p className="mt-1 text-amber-700">
                  ⚠ Date order could not be detected from the file — Day/Month/Year was assumed. If dates
                  look wrong, delete the records and re-import choosing Month/Day/Year.
                </p>
              )}
            </>
          ) : (
            <p>{result.error}</p>
          )}
          {result.parseErrors?.length ? (
            <ul className="mt-1 list-inside list-disc text-xs">
              {result.parseErrors.map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </form>
  );
}
