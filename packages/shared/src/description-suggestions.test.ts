import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLatestRequestGate,
  createTrailingThrottle,
  rankDescriptionSuggestions,
  validateRecordDescription,
  type DescriptionCandidate,
  type ThrottleClock,
} from "./description-suggestions.ts";

const candidates: DescriptionCandidate[] = [
  { type: "EXPENSE", description: "Coffee", usageCount: 2, lastUsedAt: "2026-01-01" },
  { type: "EXPENSE", description: "  coffee  ", usageCount: 2, lastUsedAt: "2026-03-01" },
  { type: "EXPENSE", description: "Coffee beans", usageCount: 3, lastUsedAt: "2026-02-01" },
  { type: "EXPENSE", description: "Office coffee", usageCount: 3, lastUsedAt: "2026-04-01" },
  { type: "EXPENSE", description: "Tea", usageCount: 4, lastUsedAt: "2026-04-01" },
  { type: "EXPENSE", description: "Alpha", usageCount: 1, lastUsedAt: "2026-05-01" },
  { type: "EXPENSE", description: "Beta", usageCount: 1, lastUsedAt: "2026-05-01" },
  { type: "EXPENSE", description: "   ", usageCount: 100, lastUsedAt: "2026-06-01" },
  { type: "INCOME", description: "Coffee", usageCount: 100, lastUsedAt: "2026-06-01" },
];

test("ranks and limits suggestions by frequency, recency and entry type", () => {
  assert.deepEqual(rankDescriptionSuggestions(candidates, "EXPENSE", ""), ["Tea", "coffee"]);
  assert.deepEqual(rankDescriptionSuggestions(candidates, "INCOME", ""), ["Coffee"]);
});

test("filters substrings, merges case variants and excludes exact matches", () => {
  assert.deepEqual(rankDescriptionSuggestions(candidates, "EXPENSE", "coF"), [
    "coffee",
    "Office coffee",
  ]);
  assert.deepEqual(rankDescriptionSuggestions(candidates, "EXPENSE", "  COFFEE  "), [
    "Office coffee",
    "Coffee beans",
  ]);
});

test("uses a deterministic alphabetical final tie-breaker", () => {
  assert.deepEqual(rankDescriptionSuggestions(candidates, "EXPENSE", "a", 10), [
    "Tea",
    "Coffee beans",
    "Alpha",
    "Beta",
  ]);
  assert.deepEqual(rankDescriptionSuggestions([], "EXPENSE", ""), []);
  assert.deepEqual(rankDescriptionSuggestions(candidates, "EXPENSE", "", 0), []);
});

test("validates required and maximum description length", () => {
  assert.equal(validateRecordDescription(""), "Enter a description.");
  assert.equal(validateRecordDescription(" \n "), "Enter a description.");
  assert.equal(validateRecordDescription("x".repeat(500)), null);
  assert.equal(
    validateRecordDescription("x".repeat(501)),
    "Description must be 500 characters or fewer.",
  );
});

test("throttle runs immediately, then sends the latest trailing value", () => {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: ThrottleClock = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout: (id) => timers.delete(id as number),
  };
  const advance = (milliseconds: number) => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
    }
  };

  const values: string[] = [];
  const throttle = createTrailingThrottle((value: string) => values.push(value), 300, clock);
  throttle.call("c");
  throttle.call("co");
  advance(100);
  throttle.call("cof");
  advance(199);
  assert.deepEqual(values, ["c"]);
  advance(1);
  assert.deepEqual(values, ["c", "cof"]);

  throttle.call("coff");
  throttle.cancel();
  advance(300);
  assert.deepEqual(values, ["c", "cof"]);
  throttle.call("income");
  assert.deepEqual(values, ["c", "cof", "income"]);
});

test("request gate rejects responses invalidated before a trailing request starts", () => {
  const gate = createLatestRequestGate();
  const firstRequestIsCurrent = gate.begin();
  assert.equal(firstRequestIsCurrent(), true);

  gate.invalidate();
  assert.equal(firstRequestIsCurrent(), false);

  const latestRequestIsCurrent = gate.begin();
  const supersededRequestIsCurrent = gate.begin();
  assert.equal(latestRequestIsCurrent(), false);
  assert.equal(supersededRequestIsCurrent(), true);
});
