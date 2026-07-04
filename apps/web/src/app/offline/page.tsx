export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-5xl">📡</div>
      <h1 className="text-xl font-bold">You’re offline</h1>
      <p className="text-sm text-gray-500">
        CoinCache needs a connection to load your data. It will be right here when you’re back online.
      </p>
    </main>
  );
}
