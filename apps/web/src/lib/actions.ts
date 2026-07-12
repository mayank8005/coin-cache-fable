"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  DEFAULT_CATEGORIES,
  DESCRIPTION_MAX_LENGTH,
  normalizeDescription,
  parseExpenseCsv,
  type DateOrder,
} from "@coincache/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { findDescriptionSuggestions } from "./description-suggestions";
import {
  checkRateLimit,
  clientIp,
  createSession,
  destroySession,
  hashPassword,
  requireAdmin,
  requireUser,
  verifyPassword,
} from "./auth";

export type ActionErrorField = "description";
export type ActionResult = { ok: boolean; error?: string; field?: ActionErrorField };

const emailSchema = z.string().trim().toLowerCase().email().max(200);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);
const nameSchema = z.string().trim().min(1).max(100);
const idSchema = z.string().cuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amountSchema = z.number().int().positive().max(9_000_000_000_000);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const iconSchema = z.string().min(1).max(8);

function fail(error: string, field?: ActionErrorField): ActionResult {
  return { ok: false, error, ...(field ? { field } : {}) };
}

/** Seed a brand-new user's private space: Cash account + default categories + settings. */
async function seedUserSpace(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.settings.upsert({ where: { userId }, create: { userId }, update: {} });
  await tx.account.create({
    data: { userId, name: "Cash", icon: "💵", color: "#4caf50", sortOrder: 0 },
  });
  await tx.category.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, userId, sortOrder: i })),
    skipDuplicates: true,
  });
}

// ---------------------------------------------------------------- auth

export async function setupAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if ((await prisma.user.count()) > 0) return fail("Setup is already complete.");
  const parsed = z
    .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { name, email, password } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash: await hashPassword(password), role: "ADMIN" },
    });
    await seedUserSpace(tx, user.id);
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await createSession(user.id);
  redirect("/");
}

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1).max(200) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail("Enter a valid email and password.");
  const { email, password } = parsed.data;

  const ip = await clientIp();
  if (!(await checkRateLimit(`ip:${ip}`, 20)) || !(await checkRateLimit(`email:${email}`, 10))) {
    return fail("Too many attempts. Try again in 15 minutes.");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-shape flow: always run a bcrypt compare so timing does not
  // reveal whether the email exists.
  const hash = user?.passwordHash ?? "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZK07q8pQ8cPzL0nO9uZfWq3vG9bkhW";
  const valid = await verifyPassword(password, hash);
  if (!user || !valid) return fail("Incorrect email or password.");

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({ current: z.string().min(1), next: passwordSchema })
    .safeParse({ current: formData.get("current"), next: formData.get("next") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(parsed.data.current, dbUser.passwordHash))) {
    return fail("Current password is incorrect.");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.next) },
    }),
    // Changing the password signs out every other device.
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await createSession(user.id);
  return { ok: true };
}

export async function addUserAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  if ((await prisma.user.count()) >= 8) return fail("User limit reached.");
  const parsed = z
    .object({ name: nameSchema, email: emailSchema, password: passwordSchema })
    .safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return fail("A user with that email already exists.");
  // New members get their own freshly seeded private space.
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        role: "MEMBER",
      },
    });
    await seedUserSpace(tx, user.id);
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function adminResetPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ userId: idSchema, password: passwordSchema })
    .safeParse({ userId: formData.get("userId"), password: formData.get("password") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (parsed.data.userId === admin.id) {
    return fail("Use 'Change my password' for your own account.");
  }
  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!target) return fail("User not found.");
  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);
  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------- records

const recordSchema = z.object({
  id: idSchema.optional(),
  type: z.enum(["EXPENSE", "INCOME"]),
  amountMinor: amountSchema,
  date: dateSchema,
  note: z
    .string()
    .trim()
    .min(1, "Enter a description.")
    .max(
      DESCRIPTION_MAX_LENGTH,
      `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    ),
  accountId: idSchema,
  categoryId: idSchema,
});

export async function saveRecordAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    const descriptionIssue = parsed.error.issues.find((issue) => issue.path[0] === "note");
    return descriptionIssue
      ? fail(descriptionIssue.message, "description")
      : fail("Invalid record data.");
  }
  const { id, type, amountMinor, date, note, accountId, categoryId } = parsed.data;

  // Ownership checks: the category, account and (when editing) the
  // record itself must belong to the signed-in user's space.
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || category.userId !== user.id || category.type !== type) {
    return fail("Category does not match record type.");
  }
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== user.id) return fail("Unknown account.");

  const data = {
    type,
    amountMinor: BigInt(amountMinor),
    date: new Date(date + "T00:00:00Z"),
    note: note.trim(),
    accountId,
    categoryId,
  };
  if (id) {
    const existing = await prisma.record.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) return fail("Record not found.");
    await prisma.record.update({ where: { id }, data });
  } else {
    await prisma.record.create({ data: { ...data, userId: user.id } });
  }
  revalidatePath("/");
  return { ok: true };
}

const descriptionSuggestionSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]),
  query: z.string().max(DESCRIPTION_MAX_LENGTH),
});

export type DescriptionSuggestionResult =
  | { ok: true; suggestions: string[] }
  | { ok: false; suggestions: []; error: string };

export async function getDescriptionSuggestionsAction(
  input: unknown,
): Promise<DescriptionSuggestionResult> {
  const user = await requireUser();
  const parsed = descriptionSuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, suggestions: [], error: "Invalid suggestion request." };
  }

  const query = normalizeDescription(parsed.data.query);
  const normalizedQuery = query.toLowerCase();
  const suggestions = await findDescriptionSuggestions(prisma, {
    userId: user.id,
    type: parsed.data.type,
    normalizedQuery,
  });

  return { ok: true, suggestions };
}

export async function deleteRecordAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("Invalid id.");
  await prisma.record.deleteMany({ where: { id: parsed.data, userId: user.id } });
  revalidatePath("/");
  return { ok: true };
}

const transferSchema = z.object({
  id: idSchema.optional(),
  amountMinor: amountSchema,
  date: dateSchema,
  note: z.string().max(500).default(""),
  fromAccountId: idSchema,
  toAccountId: idSchema,
});

export async function saveTransferAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid transfer data.");
  const { id, amountMinor, date, note, fromAccountId, toAccountId } = parsed.data;
  if (fromAccountId === toAccountId) return fail("Choose two different accounts.");
  const count = await prisma.account.count({
    where: { id: { in: [fromAccountId, toAccountId] }, userId: user.id },
  });
  if (count !== 2) return fail("Unknown account.");
  const data = {
    amountMinor: BigInt(amountMinor),
    date: new Date(date + "T00:00:00Z"),
    note: note.trim(),
    fromAccountId,
    toAccountId,
  };
  if (id) {
    const existing = await prisma.transfer.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) return fail("Transfer not found.");
    await prisma.transfer.update({ where: { id }, data });
  } else {
    await prisma.transfer.create({ data: { ...data, userId: user.id } });
  }
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTransferAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("Invalid id.");
  await prisma.transfer.deleteMany({ where: { id: parsed.data, userId: user.id } });
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------- accounts & categories

export async function saveAccountAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({
      id: idSchema.optional(),
      name: nameSchema,
      icon: iconSchema,
      initialBalance: z.coerce.number().min(-1e10).max(1e10),
    })
    .safeParse({
      id: (formData.get("id") as string) || undefined,
      name: formData.get("name"),
      icon: formData.get("icon") || "💵",
      initialBalance: formData.get("initialBalance") || 0,
    });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { id, name, icon, initialBalance } = parsed.data;
  const data = { name, icon, initialBalanceMinor: BigInt(Math.round(initialBalance * 100)) };
  if (id) {
    const { count } = await prisma.account.updateMany({
      where: { id, userId: user.id },
      data,
    });
    if (count === 0) return fail("Account not found.");
  } else {
    await prisma.account.create({ data: { ...data, userId: user.id } });
  }
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

export async function setAccountArchivedAction(id: unknown, archived: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("Invalid id.");
  if (archived) {
    const active = await prisma.account.count({ where: { userId: user.id, archived: false } });
    if (active <= 1) return fail("Keep at least one active account.");
  }
  await prisma.account.updateMany({
    where: { id: parsed.data, userId: user.id },
    data: { archived: !!archived },
  });
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveCategoryAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({
      id: idSchema.optional(),
      name: nameSchema,
      type: z.enum(["EXPENSE", "INCOME"]),
      icon: iconSchema,
      color: colorSchema,
    })
    .safeParse({
      id: (formData.get("id") as string) || undefined,
      name: formData.get("name"),
      type: formData.get("type"),
      icon: formData.get("icon") || "📦",
      color: formData.get("color") || "#9e9e9e",
    });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { id, ...data } = parsed.data;
  try {
    if (id) {
      const { count } = await prisma.category.updateMany({
        where: { id, userId: user.id },
        data,
      });
      if (count === 0) return fail("Category not found.");
    } else {
      await prisma.category.create({ data: { ...data, userId: user.id } });
    }
  } catch {
    return fail("A category with that name already exists.");
  }
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

export async function setCategoryArchivedAction(id: unknown, archived: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("Invalid id.");
  await prisma.category.updateMany({
    where: { id: parsed.data, userId: user.id },
    data: { archived: !!archived },
  });
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({
      currency: z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code like INR"),
      timezone: z.string().min(1).max(64),
    })
    .safeParse({
      currency: String(formData.get("currency") ?? "").toUpperCase(),
      timezone: formData.get("timezone"),
    });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
  } catch {
    return fail("Unknown timezone.");
  }
  await prisma.settings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------- import

export type ImportResult = {
  ok: boolean;
  error?: string;
  imported?: number;
  skippedDuplicates?: number;
  createdCategories?: string[];
  createdAccounts?: string[];
  parseErrors?: { line: number; message: string }[];
  dateOrderAmbiguous?: boolean;
};

export async function importCsvAction(formData: FormData): Promise<ImportResult> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File too large (max 10 MB)." };
  const dateOrder = (formData.get("dateOrder") as DateOrder) || "auto";
  if (!["auto", "DMY", "MDY"].includes(dateOrder)) return { ok: false, error: "Invalid date order." };
  const skipDuplicates = formData.get("skipDuplicates") === "on";

  const text = await file.text();
  const parsed = parseExpenseCsv(text, dateOrder);
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      error: "No rows could be read from this file.",
      parseErrors: parsed.errors.slice(0, 10),
    };
  }

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id } }),
    prisma.category.findMany({ where: { userId: user.id } }),
  ]);
  const accountByName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  const catByKey = new Map(categories.map((c) => [`${c.type}:${c.name.toLowerCase()}`, c]));
  const createdAccounts: string[] = [];
  const createdCategories: string[] = [];

  for (const row of parsed.rows) {
    if (!accountByName.has(row.account.toLowerCase())) {
      const acc = await prisma.account.create({
        data: {
          userId: user.id,
          name: row.account,
          icon: "💳",
          sortOrder: accounts.length + createdAccounts.length,
        },
      });
      accountByName.set(row.account.toLowerCase(), acc);
      createdAccounts.push(row.account);
    }
    const key = `${row.type}:${row.category.toLowerCase()}`;
    if (!catByKey.has(key)) {
      const palette = ["#e35d5d", "#f2a13c", "#4fb0e6", "#ba68c8", "#26a69a", "#7986cb", "#f06292", "#8bc34a"];
      const cat = await prisma.category.create({
        data: {
          userId: user.id,
          name: row.category,
          type: row.type,
          icon: row.type === "INCOME" ? "💰" : "🏷️",
          color: palette[(catByKey.size + createdCategories.length) % palette.length],
          sortOrder: 100 + createdCategories.length,
        },
      });
      catByKey.set(key, cat);
      createdCategories.push(`${row.category} (${row.type.toLowerCase()})`);
    }
  }

  let existingKeys = new Set<string>();
  if (skipDuplicates) {
    const existing = await prisma.record.findMany({
      where: { userId: user.id },
      select: { date: true, amountMinor: true, type: true, note: true, categoryId: true },
    });
    existingKeys = new Set(
      existing.map(
        (r) => `${r.date.toISOString().slice(0, 10)}|${r.type}|${r.amountMinor}|${r.categoryId}|${r.note}`,
      ),
    );
  }

  const toCreate = [];
  let skipped = 0;
  for (const row of parsed.rows) {
    const account = accountByName.get(row.account.toLowerCase())!;
    const category = catByKey.get(`${row.type}:${row.category.toLowerCase()}`)!;
    const key = `${row.date}|${row.type}|${BigInt(row.amountMinor)}|${category.id}|${row.note}`;
    if (skipDuplicates && existingKeys.has(key)) {
      skipped++;
      continue;
    }
    toCreate.push({
      userId: user.id,
      type: row.type,
      amountMinor: BigInt(row.amountMinor),
      date: new Date(row.date + "T00:00:00Z"),
      note: row.note,
      accountId: account.id,
      categoryId: category.id,
    });
  }
  if (toCreate.length > 0) await prisma.record.createMany({ data: toCreate });

  revalidatePath("/");
  return {
    ok: true,
    imported: toCreate.length,
    skippedDuplicates: skipped,
    createdCategories,
    createdAccounts,
    parseErrors: parsed.errors.slice(0, 10),
    dateOrderAmbiguous: parsed.dateOrderAmbiguous,
  };
}
