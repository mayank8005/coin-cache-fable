import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { requireSafeE2eDatabaseUrl } from "./database-safety";

export const TEST_EMAIL = "dashboard@example.test";
export const TEST_PASSWORD = "test-password";

process.env.DATABASE_URL = requireSafeE2eDatabaseUrl();
const prisma = new PrismaClient();

export type SeedDates = {
  /** Always the real current date: dialogs default to it and tests add records there. */
  today: string;
  /** Three further dates in the same calendar month as `today` (see `siblingDays`). */
  yesterday: string;
  incomeOnly: string;
  transferOnly: string;
  /** Two months back — outside the dashboard's current month, used by search tests. */
  oldRent: string;
  oldMisc: string;
};

function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Three dates that always share `today`'s calendar month, so the dashboard's
 * month view holds all four fixture dates. On the 1st–3rd, counting backwards
 * would spill into the previous month and silently drop date cards, so the
 * trio moves forward instead (every month has at least 28 days).
 */
function siblingDays(today: string): [string, string, string] {
  const dayOfMonth = Number(today.slice(8, 10));
  const step = dayOfMonth >= 4 ? -1 : 1;
  return [shiftDate(today, step), shiftDate(today, step * 2), shiftDate(today, step * 3)];
}

/** A fixed day in the month `months` away, so the pair never straddles a boundary. */
function shiftMonthDay(iso: string, months: number, day: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, day))
    .toISOString()
    .slice(0, 10);
}

function dbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export async function seedDashboard(): Promise<SeedDates> {
  const unexpectedUsers = await prisma.user.count({ where: { email: { not: TEST_EMAIL } } });
  if (unexpectedUsers > 0) {
    throw new Error("Refusing to reset E2E fixtures because the database contains non-test users.");
  }
  await prisma.$transaction([
    prisma.loginAttempt.deleteMany(),
    prisma.user.deleteMany({ where: { email: TEST_EMAIL } }),
  ]);

  const user = await prisma.user.create({
    data: {
      name: "Dashboard Tester",
      email: TEST_EMAIL,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
      role: "ADMIN",
      settings: { create: { currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata" } },
    },
  });
  const [cash, bank] = await Promise.all([
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Cash",
        icon: "💵",
        color: "#4caf50",
        initialBalanceMinor: 100_000,
        sortOrder: 0,
      },
    }),
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Bank",
        icon: "🏦",
        color: "#1976d2",
        initialBalanceMinor: 200_000,
        sortOrder: 1,
      },
    }),
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Empty",
        icon: "🫙",
        color: "#9ca3af",
        sortOrder: 2,
      },
    }),
  ]);
  const [food, transport, salary, bonus] = await Promise.all([
    prisma.category.create({
      data: { userId: user.id, name: "Food", type: "EXPENSE", icon: "🍜", color: "#ef6c00" },
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Transport", type: "EXPENSE", icon: "🚌", color: "#1565c0" },
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Salary", type: "INCOME", icon: "💰", color: "#2e7d32" },
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Bonus", type: "INCOME", icon: "🎁", color: "#43a047" },
    }),
  ]);

  const today = todayInIndia();
  const [yesterday, incomeOnly, transferOnly] = siblingDays(today);
  const dates: SeedDates = {
    today,
    yesterday,
    incomeOnly,
    transferOnly,
    oldRent: shiftMonthDay(today, -2, 12),
    oldMisc: shiftMonthDay(today, -2, 14),
  };
  await prisma.record.createMany({
    data: [
      {
        userId: user.id,
        type: "EXPENSE",
        amountMinor: 10_000,
        date: dbDate(dates.today),
        note: "Lunch groceries",
        accountId: cash.id,
        categoryId: food.id,
      },
      {
        userId: user.id,
        type: "EXPENSE",
        amountMinor: 4_000,
        date: dbDate(dates.yesterday),
        note: "Market groceries",
        accountId: cash.id,
        categoryId: food.id,
      },
      {
        userId: user.id,
        type: "EXPENSE",
        amountMinor: 6_000,
        date: dbDate(dates.yesterday),
        note: "Bus pass",
        accountId: bank.id,
        categoryId: transport.id,
      },
      {
        userId: user.id,
        type: "INCOME",
        amountMinor: 50_000,
        date: dbDate(dates.yesterday),
        note: "Monthly salary",
        accountId: bank.id,
        categoryId: salary.id,
      },
      {
        userId: user.id,
        type: "INCOME",
        amountMinor: 12_000,
        date: dbDate(dates.incomeOnly),
        note: "Referral bonus",
        accountId: cash.id,
        categoryId: bonus.id,
      },
      {
        userId: user.id,
        type: "EXPENSE",
        amountMinor: 123_450,
        date: dbDate(dates.oldRent),
        note: "Old rent",
        accountId: bank.id,
        categoryId: food.id,
      },
      {
        userId: user.id,
        type: "EXPENSE",
        amountMinor: 8_000,
        date: dbDate(dates.oldMisc),
        note: "Old market run",
        accountId: cash.id,
        categoryId: transport.id,
      },
    ],
  });
  await prisma.transfer.create({
    data: {
      userId: user.id,
      amountMinor: 3_000,
      date: dbDate(dates.transferOnly),
      note: "Move to savings",
      fromAccountId: cash.id,
      toAccountId: bank.id,
    },
  });
  return dates;
}

/**
 * Bulk filler for pagination tests: one extra page-worth of cheap records in
 * the current month. Call after `seedDashboard`, before the page navigates.
 *
 * Every row shares one date AND one createdAt on purpose — that's the CSV-import
 * shape where a date+createdAt sort has no total order and Postgres is free to
 * return a different sequence per LIMIT.
 */
export async function seedExtraRecords(count: number): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
  const [account, category] = await Promise.all([
    prisma.account.findFirstOrThrow({ where: { userId: user.id, name: "Cash" } }),
    prisma.category.findFirstOrThrow({ where: { userId: user.id, name: "Food" } }),
  ]);
  const today = todayInIndia();
  const createdAt = new Date("2020-01-01T00:00:00Z");
  await prisma.record.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      userId: user.id,
      type: "EXPENSE" as const,
      amountMinor: 100 + i,
      date: dbDate(today),
      createdAt,
      note: `Bulk ${i}`,
      accountId: account.id,
      categoryId: category.id,
    })),
  });
}

/**
 * Corrupt a stored setting so server rendering throws (`Intl` rejects the
 * timezone), which is the only reachable way to exercise the error boundary now
 * that every URL parameter is validated. `restoreTimezone` undoes it.
 */
export async function breakTimezone(): Promise<void> {
  await setTimezone("Not/AZone");
}

export async function restoreTimezone(): Promise<void> {
  await setTimezone("Asia/Kolkata");
}

async function setTimezone(timezone: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
  await prisma.settings.update({ where: { userId: user.id }, data: { timezone } });
}

export async function closeTestDatabase() {
  await prisma.$disconnect();
}
