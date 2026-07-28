export const DESCRIPTION_MAX_LENGTH = 500;
export const DESCRIPTION_REQUIRED_ERROR = "Enter a description.";

export type RecordEntryType = "EXPENSE" | "INCOME";

export function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateRecordDescription(value: string): string | null {
  const description = value.trim();
  if (!description) return DESCRIPTION_REQUIRED_ERROR;
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export type ThrottleClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const systemClock: ThrottleClock = {
  now: Date.now,
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createTrailingThrottle<T>(
  callback: (value: T) => void,
  intervalMs: number,
  clock: ThrottleClock = systemClock,
) {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let timer: unknown;
  let latestValue: T | undefined;
  let hasLatestValue = false;

  function invoke() {
    timer = undefined;
    if (!hasLatestValue) return;
    const value = latestValue as T;
    latestValue = undefined;
    hasLatestValue = false;
    lastRunAt = clock.now();
    callback(value);
  }

  return {
    call(value: T) {
      latestValue = value;
      hasLatestValue = true;
      const remaining = intervalMs - (clock.now() - lastRunAt);
      if (remaining <= 0) {
        if (timer !== undefined) clock.clearTimeout(timer);
        invoke();
      } else if (timer === undefined) {
        timer = clock.setTimeout(invoke, remaining);
      }
    },
    cancel() {
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = undefined;
      latestValue = undefined;
      hasLatestValue = false;
      lastRunAt = Number.NEGATIVE_INFINITY;
    },
  };
}

export function createLatestRequestGate() {
  let generation = 0;
  return {
    begin() {
      const requestGeneration = ++generation;
      return () => requestGeneration === generation;
    },
    invalidate() {
      generation++;
    },
  };
}
