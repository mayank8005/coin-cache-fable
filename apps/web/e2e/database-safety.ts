const DATABASE_PREFIX = "coincache_e2e_";

export function requireSafeE2eDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.E2E_DATABASE_URL;
  if (!raw) {
    throw new Error("E2E_DATABASE_URL is required. Run E2E tests through `npm run test:e2e`.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("E2E_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "postgresql:" || !localHost || !databaseName.startsWith(DATABASE_PREFIX)) {
    throw new Error(
      `Refusing E2E database ${url.hostname}/${databaseName || "<missing>"}. ` +
        `Use a local database whose name starts with ${DATABASE_PREFIX}.`,
    );
  }
  if (env.E2E_ALLOW_DESTRUCTIVE_RESET !== databaseName) {
    throw new Error(
      "E2E_ALLOW_DESTRUCTIVE_RESET must exactly match the dedicated E2E database name.",
    );
  }
  return raw;
}

export function requireE2eAppPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.E2E_APP_PORT ?? "";
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error("E2E_APP_PORT must be an available non-privileged TCP port.");
  }
  return port;
}
