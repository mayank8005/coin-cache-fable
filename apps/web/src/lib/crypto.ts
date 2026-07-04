import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for secrets at rest (AI API keys). Key comes from
// APP_SECRET; falls back to a hash of DATABASE_URL so existing
// deployments keep working, but setting APP_SECRET is recommended
// (documented in .env.example).
function key(): Buffer {
  const secret = process.env.APP_SECRET || `cc-fallback:${process.env.DATABASE_URL ?? "dev"}`;
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(enc: string): string | null {
  try {
    const buf = Buffer.from(enc, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
