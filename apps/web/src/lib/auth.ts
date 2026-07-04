import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const SESSION_COOKIE = "cc_session";
const SESSION_DAYS = 60;
/** Refresh expiry / lastUsedAt at most this often to avoid a write per request. */
const TOUCH_INTERVAL_MS = 1000 * 60 * 60 * 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function cookieSecure(): Promise<boolean> {
  // Behind Caddy the request is https; direct http (e.g. first test on a bare
  // IP) must not set Secure or the browser drops the cookie entirely.
  const h = await headers();
  return h.get("x-forwarded-proto") === "https";
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: await cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
      },
    });
  }
  return { id: session.id, user: session.user };
});

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * DB-backed login rate limit: max `limit` attempts per `windowMinutes`
 * for a given key (ip / email). Survives container restarts.
 */
export async function checkRateLimit(
  key: string,
  limit = 10,
  windowMinutes = 15,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const count = await prisma.loginAttempt.count({
    where: { key, createdAt: { gte: since } },
  });
  if (count >= limit) return false;
  await prisma.loginAttempt.create({ data: { key } });
  // Opportunistic cleanup of stale rows.
  if (Math.random() < 0.05) {
    await prisma.loginAttempt
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400_000) } } })
      .catch(() => {});
  }
  return true;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}
