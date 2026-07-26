import "server-only";
import { prisma } from "./db";
import { rangeFor, todayInTz, SEARCH_PAGE_SIZE, type Period } from "./periods";
import { parseAmountMinor } from "./money";
import type { SearchByField } from "./search";

export type PlainAccount = {
  id: string;
  name: string;
  icon: string;
  color: string;
  archived: boolean;
  balanceMinor: number;
  initialBalanceMinor: number;
};

export type PlainCategory = {
  id: string;
  name: string;
  type: "EXPENSE" | "INCOME";
  icon: string;
  color: string;
  archived: boolean;
  usageCount: number;
};

export type Entry =
  | {
      kind: "record";
      id: string;
      type: "EXPENSE" | "INCOME";
      amountMinor: number;
      date: string;
      note: string;
      accountId: string;
      accountName: string;
      categoryId: string;
      categoryName: string;
      categoryIcon: string;
      categoryColor: string;
    }
  | {
      kind: "transfer";
      id: string;
      amountMinor: number;
      date: string;
      note: string;
      fromAccountId: string;
      fromAccountName: string;
      toAccountId: string;
      toAccountName: string;
    };

export type CategorySlice = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amountMinor: number;
  share: number;
};

export type Dashboard = {
  incomeMinor: number;
  expenseMinor: number;
  totalBalanceMinor: number;
  byCategory: CategorySlice[];
  entries: Entry[];
  rangeLabel: string;
};

export async function getSettings(userId: string) {
  return (
    (await prisma.settings.findUnique({ where: { userId } })) ?? {
      userId,
      currency: "INR",
      locale: "en-IN",
      timezone: process.env.TZ || "Asia/Kolkata",
    }
  );
}

export async function userCount(): Promise<number> {
  return prisma.user.count();
}

export async function getAccountsWithBalances(userId: string): Promise<PlainAccount[]> {
  const [accounts, recordSums, transferFrom, transferTo] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.record.groupBy({
      by: ["accountId", "type"],
      where: { userId },
      _sum: { amountMinor: true },
    }),
    prisma.transfer.groupBy({
      by: ["fromAccountId"],
      where: { userId },
      _sum: { amountMinor: true },
    }),
    prisma.transfer.groupBy({
      by: ["toAccountId"],
      where: { userId },
      _sum: { amountMinor: true },
    }),
  ]);
  return accounts.map((a) => {
    let balance = Number(a.initialBalanceMinor);
    for (const s of recordSums) {
      if (s.accountId !== a.id) continue;
      const sum = Number(s._sum.amountMinor ?? 0);
      balance += s.type === "INCOME" ? sum : -sum;
    }
    for (const t of transferFrom)
      if (t.fromAccountId === a.id) balance -= Number(t._sum.amountMinor ?? 0);
    for (const t of transferTo)
      if (t.toAccountId === a.id) balance += Number(t._sum.amountMinor ?? 0);
    return {
      id: a.id,
      name: a.name,
      icon: a.icon,
      color: a.color,
      archived: a.archived,
      balanceMinor: balance,
      initialBalanceMinor: Number(a.initialBalanceMinor),
    };
  });
}

export async function getCategories(userId: string): Promise<PlainCategory[]> {
  const [cats, usage] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.record.groupBy({
      by: ["categoryId"],
      where: { userId },
      _count: true,
    }),
  ]);
  const counts = new Map(usage.map((u) => [u.categoryId, u._count]));
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color,
    archived: c.archived,
    usageCount: counts.get(c.id) ?? 0,
  }));
}

export type SearchFilters = {
  q: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER" | null;
  categoryId: string | null;
  accountId: string | null;
  start: string | null;
  end: string | null;
  minMinor: number | null;
  maxMinor: number | null;
  /** Fields `q` is matched against; defaults to description + exact amount. */
  searchBy: SearchByField[];
};

export type SearchResult = {
  entries: Entry[];
  /** Total matches across all pages; entries holds at most SEARCH_PAGE_SIZE. */
  totalCount: number;
  /** The page these entries came from — a deep request is clamped to the last. */
  page: number;
  expenseMinor: number;
  incomeMinor: number;
};

export async function searchEntries(
  userId: string,
  f: SearchFilters,
  page = 1,
): Promise<SearchResult> {
  const dateFilter =
    f.start || f.end
      ? {
          ...(f.start ? { gte: new Date(f.start + "T00:00:00Z") } : {}),
          ...(f.end ? { lt: new Date(f.end + "T00:00:00Z") } : {}),
        }
      : undefined;
  const q = f.q.trim();
  const amountFilter =
    f.minMinor !== null || f.maxMinor !== null
      ? {
          amountMinor: {
            ...(f.minMinor !== null ? { gte: f.minMinor } : {}),
            ...(f.maxMinor !== null ? { lte: f.maxMinor } : {}),
          },
        }
      : {};

  // Free-text matching: `q` is OR-ed across the enabled fields. "amount" only
  // contributes when q parses as a money amount (exact match on minor units).
  const like = { contains: q, mode: "insensitive" as const };
  const qMinor = f.searchBy.includes("amount") ? parseAmountMinor(q) : null;
  const recordOr = q
    ? [
        ...(f.searchBy.includes("note") ? [{ note: like }] : []),
        ...(qMinor !== null ? [{ amountMinor: qMinor }] : []),
        ...(f.searchBy.includes("category") ? [{ category: { name: like } }] : []),
        ...(f.searchBy.includes("account") ? [{ account: { name: like } }] : []),
      ]
    : [];
  const transferOr = q
    ? [
        ...(f.searchBy.includes("note") ? [{ note: like }] : []),
        ...(qMinor !== null ? [{ amountMinor: qMinor }] : []),
        ...(f.searchBy.includes("account")
          ? [{ fromAccount: { name: like } }, { toAccount: { name: like } }]
          : []),
      ]
    : [];

  // An empty OR list with a query present means "nothing can match" (e.g. only
  // Amount enabled with non-numeric q): skip the query so counts zero out
  // instead of falling back to an unfiltered match-all.
  let wantRecords = f.type !== "TRANSFER";
  let wantTransfers = (f.type === null || f.type === "TRANSFER") && !f.categoryId;
  if (q) {
    wantRecords &&= recordOr.length > 0;
    wantTransfers &&= transferOr.length > 0;
  }

  const recordWhere = {
    userId,
    ...(f.type === "EXPENSE" || f.type === "INCOME" ? { type: f.type } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.accountId ? { accountId: f.accountId } : {}),
    ...(dateFilter ? { date: dateFilter } : {}),
    ...amountFilter,
    ...(q ? { OR: recordOr } : {}),
  };
  const transferWhere = {
    userId,
    ...(dateFilter ? { date: dateFilter } : {}),
    ...amountFilter,
    AND: [
      ...(f.accountId
        ? [{ OR: [{ fromAccountId: f.accountId }, { toAccountId: f.accountId }] }]
        : []),
      ...(q ? [{ OR: transferOr }] : []),
    ],
  };

  // The two tables are merged by date, so a page boundary can fall anywhere in
  // either one: fetch both up to the end of the requested page, then slice.
  // Counts first: they're cheap aggregates, and knowing the total lets a deep
  // page request stop short of fetching everything only to slice out nothing.
  const [recordTotals, transferCount] = await Promise.all([
    wantRecords
      ? prisma.record.groupBy({
          by: ["type"],
          where: recordWhere,
          _sum: { amountMinor: true },
          _count: true,
        })
      : Promise.resolve([]),
    wantTransfers ? prisma.transfer.count({ where: transferWhere }) : Promise.resolve(0),
  ]);

  let expenseMinor = 0;
  let incomeMinor = 0;
  let totalCount = transferCount;
  for (const t of recordTotals) {
    const sum = Number(t._sum.amountMinor ?? 0);
    if (t.type === "INCOME") incomeMinor += sum;
    else expenseMinor += sum;
    totalCount += t._count;
  }

  const lastPage = Math.max(1, Math.ceil(totalCount / SEARCH_PAGE_SIZE));
  // Reported back so the UI labels the rows by the page that was served rather
  // than re-deriving this clamp and risking a heading that contradicts them.
  // Defensive against a non-integer page: the route clamps it today, but a NaN
  // would reach Prisma as a Float and a fraction would offset by half a page.
  const servedPage = Number.isFinite(page)
    ? Math.max(1, Math.min(Math.trunc(page), lastPage))
    : 1;
  const offset = (servedPage - 1) * SEARCH_PAGE_SIZE;
  const fetchCount = offset + SEARCH_PAGE_SIZE;

  // `id` breaks ties the clock can't: rows imported in one batch share a
  // createdAt, and without a total order Postgres is free to return them in a
  // different sequence per LIMIT, which silently duplicates and drops rows
  // across page boundaries. The merge below repeats the same tiebreak.
  const [records, transfers] = await Promise.all([
    wantRecords && totalCount > 0
      ? prisma.record.findMany({
          where: recordWhere,
          include: { category: true, account: true },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: fetchCount,
        })
      : Promise.resolve([]),
    wantTransfers && totalCount > 0
      ? prisma.transfer.findMany({
          where: transferWhere,
          include: { fromAccount: true, toAccount: true },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: fetchCount,
        })
      : Promise.resolve([]),
  ]);

  type Sortable = { entry: Entry; createdAt: number; id: string };
  const entries: Entry[] = [
    ...records.map(
      (r): Sortable => ({
        createdAt: r.createdAt.getTime(),
        id: r.id,
        entry: {
          kind: "record",
          id: r.id,
          type: r.type,
          amountMinor: Number(r.amountMinor),
          date: r.date.toISOString().slice(0, 10),
          note: r.note,
          accountId: r.accountId,
          accountName: r.account.name,
          categoryId: r.categoryId,
          categoryName: r.category.name,
          categoryIcon: r.category.icon,
          categoryColor: r.category.color,
        },
      }),
    ),
    ...transfers.map(
      (t): Sortable => ({
        createdAt: t.createdAt.getTime(),
        id: t.id,
        entry: {
          kind: "transfer",
          id: t.id,
          amountMinor: Number(t.amountMinor),
          date: t.date.toISOString().slice(0, 10),
          note: t.note,
          fromAccountId: t.fromAccountId,
          fromAccountName: t.fromAccount.name,
          toAccountId: t.toAccountId,
          toAccountName: t.toAccount.name,
        },
      }),
    ),
  ]
    .sort((a, b) => {
      if (a.entry.date !== b.entry.date) return a.entry.date < b.entry.date ? 1 : -1;
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(offset, offset + SEARCH_PAGE_SIZE)
    .map((s) => s.entry);

  return { entries, totalCount, page: servedPage, expenseMinor, incomeMinor };
}

export async function getDashboard(opts: {
  userId: string;
  period: Period;
  offset: number;
  accountId: string | null;
}): Promise<Dashboard> {
  const settings = await getSettings(opts.userId);
  const { start, end, label } = rangeFor(
    opts.period,
    opts.offset,
    todayInTz(settings.timezone),
  );

  const dateFilter =
    start && end
      ? { gte: new Date(start + "T00:00:00Z"), lt: new Date(end + "T00:00:00Z") }
      : undefined;

  const recordWhere = {
    userId: opts.userId,
    ...(dateFilter ? { date: dateFilter } : {}),
    ...(opts.accountId ? { accountId: opts.accountId } : {}),
  };
  const transferWhere = {
    userId: opts.userId,
    ...(dateFilter ? { date: dateFilter } : {}),
    ...(opts.accountId
      ? { OR: [{ fromAccountId: opts.accountId }, { toAccountId: opts.accountId }] }
      : {}),
  };

  const [records, transfers, accounts] = await Promise.all([
    prisma.record.findMany({
      where: recordWhere,
      include: { category: true, account: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.transfer.findMany({
      where: transferWhere,
      include: { fromAccount: true, toAccount: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    getAccountsWithBalances(opts.userId),
  ]);

  let incomeMinor = 0;
  let expenseMinor = 0;
  const catMap = new Map<string, CategorySlice>();
  for (const r of records) {
    const amt = Number(r.amountMinor);
    if (r.type === "INCOME") {
      incomeMinor += amt;
    } else {
      expenseMinor += amt;
      const slice = catMap.get(r.categoryId) ?? {
        categoryId: r.categoryId,
        name: r.category.name,
        icon: r.category.icon,
        color: r.category.color,
        amountMinor: 0,
        share: 0,
      };
      slice.amountMinor += amt;
      catMap.set(r.categoryId, slice);
    }
  }
  const byCategory = [...catMap.values()].sort((a, b) => b.amountMinor - a.amountMinor);
  for (const s of byCategory) s.share = expenseMinor > 0 ? s.amountMinor / expenseMinor : 0;

  const entries: Entry[] = [
    ...records.map(
      (r): Entry => ({
        kind: "record",
        id: r.id,
        type: r.type,
        amountMinor: Number(r.amountMinor),
        date: r.date.toISOString().slice(0, 10),
        note: r.note,
        accountId: r.accountId,
        accountName: r.account.name,
        categoryId: r.categoryId,
        categoryName: r.category.name,
        categoryIcon: r.category.icon,
        categoryColor: r.category.color,
      }),
    ),
    ...transfers.map(
      (t): Entry => ({
        kind: "transfer",
        id: t.id,
        amountMinor: Number(t.amountMinor),
        date: t.date.toISOString().slice(0, 10),
        note: t.note,
        fromAccountId: t.fromAccountId,
        fromAccountName: t.fromAccount.name,
        toAccountId: t.toAccountId,
        toAccountName: t.toAccount.name,
      }),
    ),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const visible = opts.accountId
    ? accounts.filter((a) => a.id === opts.accountId)
    : accounts.filter((a) => !a.archived);
  const totalBalanceMinor = visible.reduce((s, a) => s + a.balanceMinor, 0);

  return { incomeMinor, expenseMinor, totalBalanceMinor, byCategory, entries, rangeLabel: label };
}
