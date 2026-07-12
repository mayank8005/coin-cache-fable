import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { findDescriptionSuggestions } from "./description-suggestions.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
let userId = "";

before(async () => {
  if (!databaseUrl) return;
  const user = await prisma.user.create({
    data: {
      email: `description-test-${Date.now()}@example.com`,
      name: "Description query test",
      passwordHash: "not-used",
      settings: { create: {} },
      accounts: { create: { name: "Cash" } },
      categories: {
        create: [
          { name: "Food", type: "EXPENSE" },
          { name: "Salary", type: "INCOME" },
        ],
      },
    },
    include: { accounts: true, categories: true },
  });
  userId = user.id;
  const accountId = user.accounts[0].id;
  const expenseCategoryId = user.categories.find((category) => category.type === "EXPENSE")!.id;
  const incomeCategoryId = user.categories.find((category) => category.type === "INCOME")!.id;
  const now = Date.now();
  await prisma.record.createMany({
    data: [
      { note: "Office coffee", createdAt: new Date(now - 8_000) },
      { note: "\tOffice\t\tcoffee\t", createdAt: new Date(now - 7_000) },
      { note: "\t\n  \t", createdAt: new Date(now - 6_000) },
      { note: "Recent older", createdAt: new Date(now - 5_000) },
      { note: "Recent newer", createdAt: new Date(now - 4_000) },
      { note: "Tie beta", createdAt: new Date(now - 3_000) },
      { note: "Tie alpha", createdAt: new Date(now - 3_000) },
    ].map((record, index) => ({
      ...record,
      userId,
      type: "EXPENSE" as const,
      amountMinor: BigInt(100 + index),
      date: new Date("2026-07-13T00:00:00Z"),
      accountId,
      categoryId: expenseCategoryId,
    })),
  });
  await prisma.record.createMany({
    data: ["Office coffee", "office   COFFEE", "Income only"].map((note, index) => ({
      userId,
      type: "INCOME" as const,
      amountMinor: BigInt(1_000 + index),
      date: new Date("2026-07-13T00:00:00Z"),
      note,
      accountId,
      categoryId: incomeCategoryId,
      createdAt: new Date(now - index * 1_000),
    })),
  });
});

after(async () => {
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

integrationTest("applies the production ranking contract", async () => {
  assert.deepEqual(
    await findDescriptionSuggestions(prisma, {
      userId,
      type: "EXPENSE",
      normalizedQuery: "office c",
    }),
    ["Office coffee"],
  );

  const initial = await findDescriptionSuggestions(prisma, {
    userId,
    type: "EXPENSE",
    normalizedQuery: "",
  });
  assert.deepEqual(initial, ["Office coffee", "Tie alpha"]);
  assert.equal(initial.length, 2);
  assert.equal(initial.some((description) => description.trim() === ""), false);

  assert.deepEqual(
    await findDescriptionSuggestions(prisma, {
      userId,
      type: "EXPENSE",
      normalizedQuery: "recent",
    }),
    ["Recent newer", "Recent older"],
  );
  assert.deepEqual(
    await findDescriptionSuggestions(prisma, {
      userId,
      type: "EXPENSE",
      normalizedQuery: "tie",
    }),
    ["Tie alpha", "Tie beta"],
  );
  assert.deepEqual(
    await findDescriptionSuggestions(prisma, {
      userId,
      type: "EXPENSE",
      normalizedQuery: "office coffee",
    }),
    [],
  );
  assert.deepEqual(
    await findDescriptionSuggestions(prisma, {
      userId,
      type: "EXPENSE",
      normalizedQuery: "income",
    }),
    [],
  );
  assert.deepEqual(
    await findDescriptionSuggestions(prisma, {
      userId,
      type: "INCOME",
      normalizedQuery: "office c",
    }),
    ["Office coffee"],
  );
});
