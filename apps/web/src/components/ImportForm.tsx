"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importCsvAction, type ImportResult } from "@/lib/actions";

export default function ImportForm() {
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await importCsvAction(fd);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input
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
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {pending ? "Importing…" : "Import CSV"}
      </button>

      {result && (
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
