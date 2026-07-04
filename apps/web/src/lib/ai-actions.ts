"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { requireUser } from "./auth";
import { encryptSecret } from "./crypto";
import { chatJson, DEFAULT_BASE_URLS, getAiConfig, listModels } from "./ai";
import { getAccountsWithBalances, getCategories, getSettings } from "./data";
import { todayInTz } from "./periods";

const providerSchema = z.enum(["OLLAMA", "OPENAI"]);
const baseUrlSchema = z
  .string()
  .trim()
  .url()
  .max(300)
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), "Must be an http(s) URL");

export type AiModelsResult = { ok: boolean; error?: string; models?: string[] };

/**
 * Connect with the submitted (not yet saved) settings and list models.
 * A blank API key means "use the one already stored".
 */
export async function loadAiModelsAction(formData: FormData): Promise<AiModelsResult> {
  const user = await requireUser();
  const parsed = z
    .object({ provider: providerSchema, baseUrl: baseUrlSchema, apiKey: z.string().max(500) })
    .safeParse({
      provider: formData.get("provider"),
      baseUrl: formData.get("baseUrl"),
      apiKey: formData.get("apiKey") ?? "",
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let apiKey: string | null = parsed.data.apiKey.trim() || null;
  if (!apiKey) {
    apiKey = (await getAiConfig(user.id))?.apiKey ?? null;
  }
  if (parsed.data.provider === "OPENAI" && !apiKey) {
    return { ok: false, error: "OpenAI needs an API key." };
  }
  try {
    const models = await listModels(parsed.data.baseUrl, apiKey);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach the provider." };
  }
}

export type AiSaveResult = { ok: boolean; error?: string };

export async function saveAiSettingsAction(formData: FormData): Promise<AiSaveResult> {
  const user = await requireUser();
  const parsed = z
    .object({
      provider: providerSchema,
      baseUrl: baseUrlSchema,
      apiKey: z.string().max(500),
      model: z.string().trim().min(1).max(200),
    })
    .safeParse({
      provider: formData.get("provider"),
      baseUrl: formData.get("baseUrl"),
      apiKey: formData.get("apiKey") ?? "",
      model: formData.get("model"),
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const newKey = parsed.data.apiKey.trim();
  const existing = await prisma.aiSettings.findUnique({ where: { userId: user.id } });
  const apiKeyEnc = newKey ? encryptSecret(newKey) : existing?.apiKeyEnc ?? null;
  if (parsed.data.provider === "OPENAI" && !apiKeyEnc) {
    return { ok: false, error: "OpenAI needs an API key." };
  }

  await prisma.aiSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      provider: parsed.data.provider,
      baseUrl: parsed.data.baseUrl,
      apiKeyEnc,
      model: parsed.data.model,
    },
    update: {
      provider: parsed.data.provider,
      baseUrl: parsed.data.baseUrl,
      apiKeyEnc,
      model: parsed.data.model,
    },
  });
  revalidatePath("/settings/ai");
  revalidatePath("/");
  return { ok: true };
}

export async function disableAiAction(): Promise<AiSaveResult> {
  const user = await requireUser();
  await prisma.aiSettings.deleteMany({ where: { userId: user.id } });
  revalidatePath("/settings/ai");
  revalidatePath("/");
  return { ok: true };
}

export type QuickAddProposal = {
  ok: boolean;
  error?: string;
  proposal?: {
    type: "EXPENSE" | "INCOME";
    amountMinor: number;
    categoryId: string;
    accountId: string;
    date: string;
    note: string;
  };
};

/**
 * Turn a free-text phrase ("chai 20 with friends yesterday") into a
 * record proposal. Nothing is saved here — the client shows the
 * proposal and saving goes through the normal saveRecordAction with
 * all its ownership checks.
 */
export async function aiQuickAddAction(input: unknown): Promise<QuickAddProposal> {
  const user = await requireUser();
  const parsed = z.string().trim().min(2).max(300).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Describe the expense in a few words." };

  const cfg = await getAiConfig(user.id);
  if (!cfg?.model) return { ok: false, error: "Set up AI in Settings → AI features first." };

  const [settings, categories, accounts] = await Promise.all([
    getSettings(user.id),
    getCategories(user.id),
    getAccountsWithBalances(user.id),
  ]);
  const activeCategories = categories.filter((c) => !c.archived);
  const activeAccounts = accounts.filter((a) => !a.archived);
  const today = todayInTz(settings.timezone);

  const system = [
    "You convert one short expense or income phrase into strict JSON. Respond with JSON only, no prose.",
    `Schema: {"type":"EXPENSE"|"INCOME","amount":<number, major currency units>,"category":<one of the allowed names>,"account":<one of the allowed names>,"date":"YYYY-MM-DD","note":<short string>}`,
    `Allowed expense categories: ${activeCategories.filter((c) => c.type === "EXPENSE").map((c) => c.name).join(", ")}.`,
    `Allowed income categories: ${activeCategories.filter((c) => c.type === "INCOME").map((c) => c.name).join(", ")}.`,
    `Allowed accounts: ${activeAccounts.map((a) => a.name).join(", ")} (default: ${activeAccounts[0]?.name ?? "Cash"}).`,
    `Today is ${today}; resolve words like yesterday/last friday against it. Currency: ${settings.currency}.`,
    "Pick the closest category; if unsure use 'Other' for expenses. The note is what remains of the phrase, or empty.",
  ].join("\n");

  let raw: Record<string, unknown>;
  try {
    raw = await chatJson(cfg, system, parsed.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed." };
  }

  const out = z
    .object({
      type: z.enum(["EXPENSE", "INCOME"]).catch("EXPENSE"),
      amount: z.coerce.number().positive().max(90_000_000_000),
      category: z.string().default(""),
      account: z.string().default(""),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(today),
      note: z.string().max(500).catch(""),
    })
    .safeParse(raw);
  if (!out.success) return { ok: false, error: "The model returned an unusable answer — try rephrasing." };

  const byName = (name: string, type: "EXPENSE" | "INCOME") =>
    activeCategories.find((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase());
  const category =
    byName(out.data.category, out.data.type) ??
    byName("Other", out.data.type) ??
    activeCategories.find((c) => c.type === out.data.type);
  const account =
    activeAccounts.find((a) => a.name.toLowerCase() === out.data.account.toLowerCase()) ??
    activeAccounts[0];
  if (!category || !account) return { ok: false, error: "No matching category or account found." };

  return {
    ok: true,
    proposal: {
      type: out.data.type,
      amountMinor: Math.round(out.data.amount * 100),
      categoryId: category.id,
      accountId: account.id,
      date: out.data.date,
      note: out.data.note.trim(),
    },
  };
}
