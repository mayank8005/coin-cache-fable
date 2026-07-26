/** Which fields the free-text query `q` is matched against. */
export type SearchByField = "note" | "amount" | "category" | "account";

export const SEARCH_BY_FIELDS: { id: SearchByField; label: string }[] = [
  { id: "note", label: "Description" },
  { id: "amount", label: "Amount" },
  { id: "category", label: "Category" },
  { id: "account", label: "Account" },
];

export const DEFAULT_SEARCH_BY: SearchByField[] = ["note", "amount"];

/** Order-insensitive comparison against the default set. */
export function isDefaultSearchBy(fields: SearchByField[]): boolean {
  return (
    fields.length === DEFAULT_SEARCH_BY.length &&
    DEFAULT_SEARCH_BY.every((f) => fields.includes(f))
  );
}

/** Serialize in a stable order so the URL doesn't churn on toggle order. */
export function serializeSearchBy(fields: SearchByField[]): string {
  return SEARCH_BY_FIELDS.filter((f) => fields.includes(f.id))
    .map((f) => f.id)
    .join(",");
}

/** `"note,account"` -> `["note","account"]`; absent/empty/invalid -> the default set. */
export function parseSearchBy(value: unknown): SearchByField[] {
  if (typeof value !== "string") return [...DEFAULT_SEARCH_BY];
  const valid = new Set(SEARCH_BY_FIELDS.map((f) => f.id));
  const out: SearchByField[] = [];
  for (const raw of value.split(",")) {
    const token = raw.trim() as SearchByField;
    if (valid.has(token) && !out.includes(token)) out.push(token);
  }
  return out.length > 0 ? out : [...DEFAULT_SEARCH_BY];
}
