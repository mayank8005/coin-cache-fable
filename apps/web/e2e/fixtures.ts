import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const TEST_EMAIL = "dashboard@example.test";
export const TEST_PASSWORD = "test-password";

const prisma = new PrismaClient();

export type SeedDates = {
  today: string;
  yesterday: string;
  incomeOnly: string;
  transferOnly: string;
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

function dbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export async function seedDashboard(): Promise<SeedDates> {
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();

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
  const dates: SeedDates = {
    today,
    yesterday: shiftDate(today, -1),
    incomeOnly: shiftDate(today, -2),
    transferOnly: shiftDate(today, -3),
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

export async function closeTestDatabase() {
  await prisma.$disconnect();
}
