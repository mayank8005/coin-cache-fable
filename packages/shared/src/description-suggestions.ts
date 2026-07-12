export const DESCRIPTION_MAX_LENGTH = 500;
export const DESCRIPTION_REQUIRED_ERROR = "Enter a description.";

export type RecordEntryType = "EXPENSE" | "INCOME";

export type DescriptionCandidate = {
  type: RecordEntryType;
  description: string;
  usageCount: number;
  lastUsedAt: Date | string | number;
};

function collapseWhitespace(value: string): string {
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

export function rankDescriptionSuggestions(
  candidates: DescriptionCandidate[],
  type: RecordEntryType,
  query: string,
  limit = 2,
): string[] {
  if (limit <= 0) return [];

  const normalizedQuery = collapseWhitespace(query).toLowerCase();
  const grouped = new Map<
    string,
    { description: string; usageCount: number; lastUsedAt: number }
  >();

  for (const candidate of candidates) {
    if (candidate.type !== type) continue;
    const description = collapseWhitespace(candidate.description);
    if (!description) continue;
    const key = description.toLowerCase();
    if (normalizedQuery && !key.includes(normalizedQuery)) continue;
    if (key === normalizedQuery) continue;

    const timestamp =
      candidate.lastUsedAt instanceof Date
        ? candidate.lastUsedAt.getTime()
        : new Date(candidate.lastUsedAt).getTime();
    const lastUsedAt = Number.isFinite(timestamp) ? timestamp : 0;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        description,
        usageCount: Math.max(0, candidate.usageCount),
        lastUsedAt,
      });
      continue;
    }

    existing.usageCount += Math.max(0, candidate.usageCount);
    if (lastUsedAt > existing.lastUsedAt) {
      existing.description = description;
      existing.lastUsedAt = lastUsedAt;
    }
  }

  return [...grouped.entries()]
    .sort((a, b) => {
      if (a[1].usageCount !== b[1].usageCount) return b[1].usageCount - a[1].usageCount;
      if (a[1].lastUsedAt !== b[1].lastUsedAt) return b[1].lastUsedAt - a[1].lastUsedAt;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .slice(0, limit)
    .map(([, candidate]) => candidate.description);
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
