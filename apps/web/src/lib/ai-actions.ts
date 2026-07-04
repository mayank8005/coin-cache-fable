"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "./db";
import { requireUser } from "./auth";
import { encryptSecret } from "./crypto";
import { chatJson, chatText, getAiConfig, listModels, providerNeedsKey } from "./ai";
import { getAccountsWithBalances, getCategories, getDashboard, getSettings } from "./data";
import { todayInTz } from "./periods";

const providerSchema = z.enum(["OLLAMA", "OLLAMA_CLOUD", "OPENAI"]);
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
  if (providerNeedsKey(parsed.data.provider) && !apiKey) {
    return { ok: false, error: "This provider needs an API key." };
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
  if (providerNeedsKey(parsed.data.provider) && !apiKeyEnc) {
    return { ok: false, error: "This provider needs an API key." };
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

/** Everything a record-proposal prompt needs about the user's space. */
async function proposalContext(userId: string) {
  const [settings, categories, accounts] = await Promise.all([
    getSettings(userId),
    getCategories(userId),
    getAccountsWithBalances(userId),
  ]);
  return {
    settings,
    categories: categories.filter((c) => !c.archived),
    accounts: accounts.filter((a) => !a.archived),
    today: todayInTz(settings.timezone),
  };
}

type ProposalContext = Awaited<ReturnType<typeof proposalContext>>;

function proposalSystemPrompt(ctx: ProposalContext, source: "phrase" | "receipt"): string {
  return [
    source === "phrase"
      ? "You convert one short expense or income phrase into strict JSON. Respond with JSON only, no prose."
      : "You read a photo of a receipt/bill and produce strict JSON for one expense record (use the grand total). Respond with JSON only, no prose.",
    `Schema: {"type":"EXPENSE"|"INCOME","amount":<number, major currency units>,"category":<one of the allowed names>,"account":<one of the allowed names>,"date":"YYYY-MM-DD","note":<short string>}`,
    `Allowed expense categories: ${ctx.categories.filter((c) => c.type === "EXPENSE").map((c) => c.name).join(", ")}.`,
    `Allowed income categories: ${ctx.categories.filter((c) => c.type === "INCOME").map((c) => c.name).join(", ")}.`,
    `Allowed accounts: ${ctx.accounts.map((a) => a.name).join(", ")} (default: ${ctx.accounts[0]?.name ?? "Cash"}).`,
    `Today is ${ctx.today}; resolve relative dates against it. Currency: ${ctx.settings.currency}.`,
    source === "receipt"
      ? "Use the receipt date if visible, otherwise today. The note is the merchant name."
      : "Pick the closest category; if unsure use 'Other' for expenses. The note is what remains of the phrase, or empty.",
  ].join("\n");
}

function mapRawToProposal(raw: Record<string, unknown>, ctx: ProposalContext): QuickAddProposal {
  const out = z
    .object({
      type: z.enum(["EXPENSE", "INCOME"]).catch("EXPENSE"),
      amount: z.coerce.number().positive().max(90_000_000_000),
      category: z.string().default(""),
      account: z.string().default(""),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(ctx.today),
      note: z.string().max(500).catch(""),
    })
    .safeParse(raw);
  if (!out.success) return { ok: false, error: "The model returned an unusable answer — try again." };

  const byName = (name: string, type: "EXPENSE" | "INCOME") =>
    ctx.categories.find((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase());
  const category =
    byName(out.data.category, out.data.type) ??
    byName("Other", out.data.type) ??
    ctx.categories.find((c) => c.type === out.data.type);
  const account =
    ctx.accounts.find((a) => a.name.toLowerCase() === out.data.account.toLowerCase()) ??
    ctx.accounts[0];
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

  const ctx = await proposalContext(user.id);
  try {
    const raw = await chatJson(cfg, proposalSystemPrompt(ctx, "phrase"), parsed.data);
    return mapRawToProposal(raw, ctx);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed." };
  }
}

/**
 * Receipt photo → record proposal. Needs a vision-capable model
 * (e.g. gpt-4o-mini, llama3.2-vision, llava).
 */
export async function aiReceiptAction(imageDataUrl: unknown): Promise<QuickAddProposal> {
  const user = await requireUser();
  const parsed = z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .max(6_000_000, "Image too large — try again.")
    .safeParse(imageDataUrl);
  if (!parsed.success) return { ok: false, error: "Attach a JPEG/PNG receipt photo." };

  const cfg = await getAiConfig(user.id);
  if (!cfg?.model) return { ok: false, error: "Set up AI in Settings → AI features first." };

  const ctx = await proposalContext(user.id);
  try {
    const raw = await chatJson(
      cfg,
      proposalSystemPrompt(ctx, "receipt"),
      "Extract one record from this receipt.",
      parsed.data,
    );
    return mapRawToProposal(raw, ctx);
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `${e.message} (receipt scanning needs a vision-capable model)`
          : "AI request failed.",
    };
  }
}

// ---------------------------------------------------------------- insights

export type InsightsResult = { ok: boolean; error?: string; text?: string };

/**
 * Short narrative for the selected period. Only aggregates are sent
 * to the model — category totals and period sums, never raw records.
 */
export async function aiInsightsAction(input: unknown): Promise<InsightsResult> {
  const user = await requireUser();
  const parsed = z
    .object({
      period: z.enum(["day", "week", "month", "year", "all"]),
      offset: z.number().int().min(-1200).max(1200),
      accountId: z.string().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid period." };

  const cfg = await getAiConfig(user.id);
  if (!cfg?.model) return { ok: false, error: "Set up AI in Settings → AI features first." };

  const settings = await getSettings(user.id);
  const { period, offset, accountId } = parsed.data;
  const [current, previous] = await Promise.all([
    getDashboard({ userId: user.id, period, offset, accountId }),
    period === "all"
      ? Promise.resolve(null)
      : getDashboard({ userId: user.id, period, offset: offset - 1, accountId }),
  ]);
  if (current.entries.length === 0) {
    return { ok: false, error: "No records in this period to summarise." };
  }

  const fmtCats = (d: typeof current) =>
    d.byCategory
      .slice(0, 8)
      .map((c) => `${c.name}: ${(c.amountMinor / 100).toFixed(0)}`)
      .join(", ") || "none";

  const facts = [
    `Currency: ${settings.currency}. Period: ${current.rangeLabel}.`,
    `Income: ${(current.incomeMinor / 100).toFixed(0)}. Expenses: ${(current.expenseMinor / 100).toFixed(0)}. Net: ${((current.incomeMinor - current.expenseMinor) / 100).toFixed(0)}.`,
    `Expenses by category: ${fmtCats(current)}.`,
    previous
      ? `Previous period (${previous.rangeLabel}) — income ${(previous.incomeMinor / 100).toFixed(0)}, expenses ${(previous.expenseMinor / 100).toFixed(0)}, by category: ${fmtCats(previous)}.`
      : "No previous period for comparison.",
  ].join("\n");

  const system =
    "You are a friendly personal-finance assistant. Write a short summary (max 120 words, plain text, no markdown headings) of the user's period: the overall picture, the 2-3 biggest expense categories, and the most notable changes vs the previous period if data is provided. Use the currency's symbol with plain numbers. Be concrete and neutral — no moralising.";

  try {
    const text = await chatText(cfg, system, facts);
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed." };
  }
}

// ---------------------------------------------------------------- ask your data

export type AskResult = { ok: boolean; error?: string; answer?: string };

const planSchema = z.object({
  metric: z.enum(["sum_expense", "sum_income", "net", "count", "balance"]),
  categoryNames: z.array(z.string()).nullable().catch(null),
  accountNames: z.array(z.string()).nullable().catch(null),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  groupBy: z.enum(["category", "month", "none"]).catch("none"),
});

/**
 * Natural-language question → structured query plan (from the model)
 * → whitelisted aggregation executed server-side → deterministic
 * answer. The model never sees raw records and never writes SQL.
 */
export async function aiAskAction(input: unknown): Promise<AskResult> {
  const user = await requireUser();
  const parsed = z.string().trim().min(3).max(300).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ask a question about your spending." };

  const cfg = await getAiConfig(user.id);
  if (!cfg?.model) return { ok: false, error: "Set up AI in Settings → AI features first." };

  const ctx = await proposalContext(user.id);
  const system = [
    "You translate one question about personal finances into a strict JSON query plan. Respond with JSON only.",
    `Schema: {"metric":"sum_expense"|"sum_income"|"net"|"count"|"balance","categoryNames":[names]|null,"accountNames":[names]|null,"start":"YYYY-MM-DD"|null,"end":"YYYY-MM-DD"|null,"groupBy":"category"|"month"|"none"}`,
    "metric: sum_expense for spending questions, sum_income for earnings, net for savings, count for how-many questions, balance for current balances.",
    `Category names must come from: ${ctx.categories.map((c) => c.name).join(", ")}. null = all.`,
    `Account names must come from: ${ctx.accounts.map((a) => a.name).join(", ")}. null = all.`,
    `Today is ${ctx.today}. Resolve relative ranges (last month, this year) into start (inclusive) and end (exclusive). null = all time.`,
    'Use groupBy "category" for breakdown questions ("where did my money go"), "month" for trends over time, otherwise "none".',
  ].join("\n");

  let plan: z.infer<typeof planSchema>;
  try {
    const raw = await chatJson(cfg, system, parsed.data);
    const p = planSchema.safeParse(raw);
    if (!p.success) return { ok: false, error: "Could not understand that question — try rephrasing." };
    plan = p.data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed." };
  }

  const money = (minor: number) =>
    new Intl.NumberFormat(ctx.settings.locale, {
      style: "currency",
      currency: ctx.settings.currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);

  if (plan.metric === "balance") {
    const accounts = plan.accountNames
      ? ctx.accounts.filter((a) => plan.accountNames!.some((n) => n.toLowerCase() === a.name.toLowerCase()))
      : ctx.accounts;
    if (accounts.length === 0) return { ok: false, error: "No matching account found." };
    const total = accounts.reduce((s, a) => s + a.balanceMinor, 0);
    const lines = accounts.map((a) => `${a.icon} ${a.name}: ${money(a.balanceMinor)}`);
    return {
      ok: true,
      answer: `${lines.join("\n")}${accounts.length > 1 ? `\nTotal: ${money(total)}` : ""}`,
    };
  }

  const categoryIds = plan.categoryNames
    ? ctx.categories
        .filter((c) => plan.categoryNames!.some((n) => n.toLowerCase() === c.name.toLowerCase()))
        .map((c) => c.id)
    : null;
  if (plan.categoryNames && categoryIds!.length === 0) {
    return { ok: false, error: "No matching category found." };
  }
  const accountIds = plan.accountNames
    ? ctx.accounts
        .filter((a) => plan.accountNames!.some((n) => n.toLowerCase() === a.name.toLowerCase()))
        .map((a) => a.id)
    : null;

  const records = await prisma.record.findMany({
    where: {
      userId: user.id,
      ...(plan.metric === "sum_expense" ? { type: "EXPENSE" } : {}),
      ...(plan.metric === "sum_income" ? { type: "INCOME" } : {}),
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(accountIds ? { accountId: { in: accountIds } } : {}),
      ...(plan.start || plan.end
        ? {
            date: {
              ...(plan.start ? { gte: new Date(plan.start + "T00:00:00Z") } : {}),
              ...(plan.end ? { lt: new Date(plan.end + "T00:00:00Z") } : {}),
            },
          }
        : {}),
    },
    include: { category: true },
  });

  const rangeText =
    plan.start || plan.end
      ? ` between ${plan.start ?? "the beginning"} and ${plan.end ?? "now"}`
      : " (all time)";
  const signed = (r: (typeof records)[number]) =>
    Number(r.amountMinor) * (r.type === "EXPENSE" ? -1 : 1);

  if (plan.metric === "count") {
    return { ok: true, answer: `${records.length} matching records${rangeText}.` };
  }

  if (plan.groupBy === "category") {
    const byCat = new Map<string, number>();
    for (const r of records) {
      if (plan.metric === "sum_expense" && r.type !== "EXPENSE") continue;
      if (plan.metric === "sum_income" && r.type !== "INCOME") continue;
      byCat.set(r.category.name, (byCat.get(r.category.name) ?? 0) + Number(r.amountMinor));
    }
    const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (rows.length === 0) return { ok: true, answer: `Nothing found${rangeText}.` };
    return {
      ok: true,
      answer: rows.map(([name, minor]) => `${name}: ${money(minor)}`).join("\n") + `\n(${rangeText.trim()})`,
    };
  }

  if (plan.groupBy === "month") {
    const byMonth = new Map<string, number>();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + (plan.metric === "net" ? signed(r) : Number(r.amountMinor)));
    }
    const rows = [...byMonth.entries()].sort();
    if (rows.length === 0) return { ok: true, answer: `Nothing found${rangeText}.` };
    return { ok: true, answer: rows.map(([m, minor]) => `${m}: ${money(minor)}`).join("\n") };
  }

  const total = records.reduce((s, r) => s + (plan.metric === "net" ? signed(r) : Number(r.amountMinor)), 0);
  const label =
    plan.metric === "sum_expense" ? "You spent" : plan.metric === "sum_income" ? "You earned" : "Net";
  const catText = plan.categoryNames?.length ? ` on ${plan.categoryNames.join(", ")}` : "";
  return {
    ok: true,
    answer: `${label} ${money(total)}${catText}${rangeText} across ${records.length} records.`,
  };
}
