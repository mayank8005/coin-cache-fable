import { defineConfig } from "@playwright/test";
import {
  requireE2eAppPort,
  requireSafeE2eDatabaseUrl,
} from "./apps/web/e2e/database-safety";

const databaseUrl = requireSafeE2eDatabaseUrl();
const appPort = requireE2eAppPort();
const baseURL = `http://127.0.0.1:${appPort}`;
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 430, height: 932 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -w apps/web -- --hostname 127.0.0.1 --port ${appPort}`,
    env: { DATABASE_URL: databaseUrl, TZ: "Asia/Kolkata" },
    url: `${baseURL}/login`,
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
