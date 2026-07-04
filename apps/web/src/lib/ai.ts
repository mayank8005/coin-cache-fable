import "server-only";
import { prisma } from "./db";
import { decryptSecret } from "./crypto";

/**
 * Single client for both providers: Ollama and OpenAI both speak the
 * OpenAI-compatible API (GET /models, POST /chat/completions), so the
 * only differences are the base URL and whether a key is required.
 */
export type AiConfig = {
  provider: "OLLAMA" | "OLLAMA_CLOUD" | "OPENAI";
  baseUrl: string;
  apiKey: string | null;
  model: string | null;
};

export const DEFAULT_BASE_URLS: Record<AiConfig["provider"], string> = {
  OLLAMA: "http://host.docker.internal:11434/v1",
  OLLAMA_CLOUD: "https://ollama.com/v1",
  OPENAI: "https://api.openai.com/v1",
};

/** Local Ollama is the only provider that works without an API key. */
export function providerNeedsKey(provider: AiConfig["provider"]): boolean {
  return provider !== "OLLAMA";
}

export async function getAiConfig(userId: string): Promise<AiConfig | null> {
  const row = await prisma.aiSettings.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: row.apiKeyEnc ? decryptSecret(row.apiKeyEnc) : null,
    model: row.model,
  };
}

export function aiReady(cfg: AiConfig | null): boolean {
  return !!cfg?.model && (cfg.provider === "OLLAMA" || !!cfg.apiKey);
}

function headers(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function listModels(baseUrl: string, apiKey: string | null): Promise<string[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Provider replied ${res.status}${res.status === 401 ? " (check the API key)" : ""}`);
  }
  const body = (await res.json()) as { data?: { id?: string }[] };
  const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
  if (ids.length === 0) throw new Error("Connected, but the provider returned no models.");
  return ids.sort();
}

type UserContent =
  | string
  | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

async function completion(
  cfg: AiConfig,
  system: string,
  user: UserContent,
  opts: { json: boolean; temperature?: number },
): Promise<string> {
  if (!cfg.model) throw new Error("No model selected.");
  const call = async (withFormat: boolean) => {
    const res = await fetch(`${normalizeBaseUrl(cfg.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: headers(cfg.apiKey),
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: cfg.model,
        temperature: opts.temperature ?? 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(withFormat ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Provider replied ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? "";
  };
  if (!opts.json) return call(false);
  try {
    return await call(true);
  } catch {
    return call(false);
  }
}

/**
 * Chat completion that must return JSON. Tries response_format first
 * (supported by OpenAI and recent Ollama), falls back to plain text +
 * extraction for older servers. Pass an image data URL for
 * vision-capable models (receipt scanning).
 */
export async function chatJson(
  cfg: AiConfig,
  system: string,
  user: string,
  imageDataUrl?: string,
): Promise<Record<string, unknown>> {
  const content: UserContent = imageDataUrl
    ? [
        { type: "text", text: user },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : user;
  const raw = await completion(cfg, system, content, { json: true });
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The model did not return valid JSON.");
    return JSON.parse(match[0]);
  }
}

/** Plain prose completion (insight summaries etc.). */
export async function chatText(cfg: AiConfig, system: string, user: string): Promise<string> {
  const text = (await completion(cfg, system, user, { json: false, temperature: 0.4 })).trim();
  if (!text) throw new Error("The model returned an empty answer.");
  return text;
}
