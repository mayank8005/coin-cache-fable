import { defineConfig } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://coincache:test@127.0.0.1:5433/coincache";

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 430, height: 932 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -w apps/web -- --hostname 127.0.0.1 --port 3100",
    env: { DATABASE_URL: databaseUrl, TZ: "Asia/Kolkata" },
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { channel: "chrome" },
    },
  ],
});
