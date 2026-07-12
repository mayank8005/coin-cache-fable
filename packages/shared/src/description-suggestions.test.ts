import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLatestRequestGate,
  createTrailingThrottle,
  normalizeDescription,
  validateRecordDescription,
  type ThrottleClock,
} from "./description-suggestions.ts";

test("normalizes surrounding and repeated whitespace", () => {
  assert.equal(normalizeDescription("  Office   coffee\nshop "), "Office coffee shop");
  assert.equal(normalizeDescription("\tOffice\t\tcoffee\t"), "Office coffee");
  assert.equal(normalizeDescription("Office\u00a0coffee"), "Office coffee");
  assert.equal(normalizeDescription("\u202fOffice\ufeffcoffee\u3000"), "Office coffee");
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
