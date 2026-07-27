import { test } from "node:test";
import assert from "node:assert/strict";
import { lastDaysRange, rangeFor } from "./periods.ts";

test("lastDaysRange covers the search screen's 90-day window", () => {
  // today inclusive → end is the day after todayIso (exclusive end)
  assert.deepEqual(lastDaysRange(90, "2026-07-28"), {
    start: "2026-04-29",
    end: "2026-07-29",
  });
});

test("lastDaysRange crosses a year boundary", () => {
  assert.deepEqual(lastDaysRange(90, "2026-02-15"), {
    start: "2025-11-17",
    end: "2026-02-16",
  });
});

test("lastDaysRange spans the Feb-29 leap day", () => {
  // [2024-02-01, 2024-05-02) contains Feb 29 2024
  assert.deepEqual(lastDaysRange(90, "2024-05-01"), {
    start: "2024-02-01",
    end: "2024-05-02",
  });
});

test("lastDaysRange end is always the day after todayIso", () => {
  assert.equal(lastDaysRange(1, "2026-07-28").end, "2026-07-29");
  assert.equal(lastDaysRange(365, "2026-07-28").end, "2026-07-29");
});

test("rangeFor month at offset 0 is the current calendar month", () => {
  assert.deepEqual(rangeFor("month", 0, "2026-07-28"), {
    start: "2026-07-01",
    end: "2026-08-01",
    label: "July 2026",
  });
});

test("rangeFor month at offset -1 crosses the January boundary", () => {
  assert.deepEqual(rangeFor("month", -1, "2026-01-15"), {
    start: "2025-12-01",
    end: "2026-01-01",
    label: "December 2025",
  });
});

test("rangeFor year runs Jan 1 to next Jan 1 exclusive", () => {
  assert.deepEqual(rangeFor("year", 0, "2026-07-28"), {
    start: "2026-01-01",
    end: "2027-01-01",
    label: "2026",
  });
});

test("rangeFor week starts on Monday", () => {
  // 2026-07-28 is a Tuesday; the week starts the prior Monday
  assert.deepEqual(rangeFor("week", 0, "2026-07-28"), {
    start: "2026-07-27",
    end: "2026-08-03",
    label: "This week",
  });
});

test("rangeFor all has null bounds", () => {
  assert.deepEqual(rangeFor("all", 0, "2026-07-28"), {
    start: null,
    end: null,
    label: "All time",
  });
});
