import { expect, test } from "@playwright/test";
import { requireE2eAppPort, requireSafeE2eDatabaseUrl } from "./database-safety";

test("accepts only an explicitly authorized local E2E database", () => {
  const databaseName = "coincache_e2e_test_run";
  const databaseUrl = `postgresql://coincache:test@127.0.0.1:5433/${databaseName}`;
  expect(
    requireSafeE2eDatabaseUrl({
      E2E_DATABASE_URL: databaseUrl,
      E2E_ALLOW_DESTRUCTIVE_RESET: databaseName,
    }),
  ).toBe(databaseUrl);
});

test("rejects missing, remote, and mismatched E2E database configuration", () => {
  expect(() => requireSafeE2eDatabaseUrl({})).toThrow("E2E_DATABASE_URL is required");
  expect(() =>
    requireSafeE2eDatabaseUrl({
      E2E_DATABASE_URL: "postgresql://coincache:test@db.example.com:5432/coincache",
      E2E_ALLOW_DESTRUCTIVE_RESET: "coincache",
    }),
  ).toThrow("Refusing E2E database");
  expect(() =>
    requireSafeE2eDatabaseUrl({
      E2E_DATABASE_URL:
        "postgresql://coincache:test@127.0.0.1:5433/coincache_e2e_test_run",
      E2E_ALLOW_DESTRUCTIVE_RESET: "wrong_database",
    }),
  ).toThrow("must exactly match");
});

test("requires a valid non-privileged E2E app port", () => {
  expect(requireE2eAppPort({ E2E_APP_PORT: "43123" })).toBe(43_123);
  expect(() => requireE2eAppPort({ E2E_APP_PORT: "" })).toThrow();
  expect(() => requireE2eAppPort({ E2E_APP_PORT: "80" })).toThrow();
  expect(() => requireE2eAppPort({ E2E_APP_PORT: "not-a-port" })).toThrow();
});
