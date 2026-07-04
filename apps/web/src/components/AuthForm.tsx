"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions";

type Field = {
  name: string;
  label: string;
  type: string;
  autoComplete?: string;
};

export function AuthForm(props: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  title: string;
  subtitle: string;
  submitLabel: string;
  fields: Field[];
}) {
  const [state, formAction, pending] = useActionState(props.action, null);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-3xl shadow-md">
            🪙
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{props.title}</h1>
          <p className="mt-1 text-sm text-gray-500">{props.subtitle}</p>
        </div>
        <form action={formAction} className="space-y-4 rounded-2xl bg-white p-6 shadow-md">
          {props.fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{f.label}</span>
              <input
                name={f.name}
                type={f.type}
                autoComplete={f.autoComplete}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </label>
          ))}
          {state && !state.ok && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-brand py-2.5 text-base font-semibold text-white shadow hover:bg-brand-dark disabled:opacity-60"
          >
            {pending ? "Please wait…" : props.submitLabel}
          </button>
        </form>
      </div>
    </main>
  );
}
