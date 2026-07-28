"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

/** Catches render/data errors anywhere under the root layout. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // A bare reset() just replays the same failed server render. Refreshing first
  // re-runs it on the server, so a transient failure can actually recover.
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-5xl">😵</div>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-gray-500">
        That didn’t load. Your data is safe — give it another go.
      </p>
      <button
        onClick={retry}
        className="mt-2 flex h-11 items-center rounded-lg bg-brand px-6 text-sm font-semibold text-white shadow-sm active:bg-brand-dark"
      >
        Try again
      </button>
      {error.digest && <p className="mt-1 text-[10px] text-gray-400">Reference: {error.digest}</p>}
    </main>
  );
}
