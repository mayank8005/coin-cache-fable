import assert from "node:assert/strict";
import { test } from "node:test";
import { lastDaysRange } from "./periods.ts";

test("lastDaysRange returns exactly 90 days ending today", () => {
  assert.deepEqual(lastDaysRange(90, "2026-07-28"), {
    start: "2026-04-30",
    end: "2026-07-29",
  });
});

test("lastDaysRange returns today through tomorrow for a one-day window", () => {
  assert.deepEqual(lastDaysRange(1, "2026-07-28"), {
    start: "2026-07-28",
    end: "2026-07-29",
  });
});
