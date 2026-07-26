"use client";

/** Catches render/data errors anywhere under the root layout. */
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-5xl">😵</div>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-gray-500">
        That didn’t load. Your data is safe — give it another go.
      </p>
      <button
        onClick={reset}
        className="mt-2 flex h-11 items-center rounded-lg bg-brand px-6 text-sm font-semibold text-white shadow-sm active:bg-brand-dark"
      >
        Try again
      </button>
    </main>
  );
}
