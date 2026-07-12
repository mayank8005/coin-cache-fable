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
      categories: { create: { name: "Food", type: "EXPENSE" } },
    },
    include: { accounts: true, categories: true },
  });
  userId = user.id;
  const accountId = user.accounts[0].id;
  const categoryId = user.categories[0].id;
  const now = Date.now();
  await prisma.record.createMany({
    data: [
      { note: "Office coffee", createdAt: new Date(now - 4_000) },
      { note: "\tOffice\t\tcoffee\t", createdAt: new Date(now - 3_000) },
      { note: "\t\n  \t", createdAt: new Date(now - 2_000) },
      { note: "Coffee beans", createdAt: new Date(now - 1_000) },
      { note: "Coffee shop", createdAt: new Date(now) },
    ].map((record, index) => ({
      ...record,
      userId,
      type: "EXPENSE" as const,
      amountMinor: BigInt(100 + index),
      date: new Date("2026-07-13T00:00:00Z"),
      accountId,
      categoryId,
    })),
  });
});

after(async () => {
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

integrationTest("normalizes tabs, removes blank notes and returns at most two rows", async () => {
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
  assert.deepEqual(initial, ["Office coffee", "Coffee shop"]);
  assert.equal(initial.length, 2);
  assert.equal(initial.some((description) => description.trim() === ""), false);
});
