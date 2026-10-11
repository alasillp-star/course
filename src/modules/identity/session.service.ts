import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { authSessions, users } from "@/server/db/schema";
import { randomToken, sha256Hex } from "@/server/crypto";
import { getEnv } from "@/server/env";
import type { RequestMeta } from "@/server/http/request-meta";
import type { SessionClientType } from "@/shared/enums";
import { describeUserAgent } from "./device";

export type SessionRecord = typeof authSessions.$inferSelect;
export type SessionUser = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "status" | "locale" | "emailVerifiedAt"
>;

const LAST_SEEN_RESOLUTION_MS = 5 * 60_000;

function sessionTtlMs(): number {
  return getEnv().SESSION_MAX_AGE_DAYS * 24 * 60 * 60_000;
}

export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

/**
 * Creates a server-side session and returns the raw token for the cookie.
 * When the per-user device limit is exceeded, the least recently used
 * sessions are revoked (limits casual account sharing).
 */
export async function createSession(
  executor: Executor,
  params: {
    userId: string;
    meta: RequestMeta;
    clientType?: SessionClientType;
    mfaVerified?: boolean;
  },
): Promise<{ token: string; session: SessionRecord }> {
  const token = randomToken(32);
  const now = new Date();
  const [session] = await executor
    .insert(authSessions)
    .values({
      tokenHash: hashSessionToken(token),
      userId: params.userId,
      clientType: params.clientType ?? "web",
      authenticatedAt: now,
      mfaVerifiedAt: params.mfaVerified ? now : null,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + sessionTtlMs()),
      ipAddress: params.meta.ip,
      userAgent: params.meta.userAgent,
      deviceLabel: describeUserAgent(params.meta.userAgent),
    })
    .returning();
  if (!session) throw new Error("Failed to create session");

  const limit = getEnv().MAX_ACTIVE_SESSIONS_PER_USER;
  if (limit > 0) {
    const active = await executor
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, params.userId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
        ),
      )
      .orderBy(desc(authSessions.lastSeenAt), desc(authSessions.createdAt));
    const overflow = active.slice(limit).map((row) => row.id);
    if (overflow.length > 0) {
      await executor
        .update(authSessions)
        .set({ revokedAt: now, revokedReason: "device_limit" })
        .where(inArray(authSessions.id, overflow));
    }
  }
  return { token, session };
}

/**
 * Resolves a session token. Returns null for unknown, expired or revoked
 * sessions and for accounts that are not active. Extends the sliding
 * expiration and refreshes `last_seen_at` at most every few minutes.
 */
export async function validateSessionToken(
  executor: Executor,
  token: string,
): Promise<{ session: SessionRecord; user: SessionUser } | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const [row] = await executor
    .select({
      session: authSessions,
      user: {
        id: users.id,
        email: users.email,
        status: users.status,
        locale: users.locale,
        emailVerifiedAt: users.emailVerifiedAt,
      },
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, hashSessionToken(token)));

  if (!row) return null;
  const { session, user } = row;
  const now = Date.now();
  if (session.revokedAt || session.expiresAt.getTime() <= now) return null;
  if (user.status !== "active") return null;

  const ttl = sessionTtlMs();
  const shouldExtend = session.expiresAt.getTime() - now < ttl / 2;
  const shouldTouch = now - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS;
  if (shouldExtend || shouldTouch) {
    const patch: Partial<SessionRecord> = { lastSeenAt: new Date(now) };
    if (shouldExtend) patch.expiresAt = new Date(now + ttl);
    await executor.update(authSessions).set(patch).where(eq(authSessions.id, session.id));
    await executor.update(users).set({ lastSeenAt: new Date(now) }).where(eq(users.id, user.id));
    Object.assign(session, patch);
  }
  return { session, user };
}

export async function listActiveSessions(executor: Executor, userId: string) {
  return executor
    .select({
      id: authSessions.id,
      deviceLabel: authSessions.deviceLabel,
      clientType: authSessions.clientType,
      ipAddress: authSessions.ipAddress,
      createdAt: authSessions.createdAt,
      lastSeenAt: authSessions.lastSeenAt,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(authSessions.lastSeenAt));
}

/** Revokes one session of `userId` (ownership enforced in the WHERE clause). */
export async function revokeSession(
  executor: Executor,
  params: { userId: string; sessionId: string; reason: string },
): Promise<boolean> {
  const revoked = await executor
    .update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: params.reason })
    .where(
      and(
        eq(authSessions.id, params.sessionId),
        eq(authSessions.userId, params.userId),
        isNull(authSessions.revokedAt),
      ),
    )
    .returning({ id: authSessions.id });
  return revoked.length > 0;
}

/** Revokes every session of a user, optionally keeping the current one. */
export async function revokeAllSessions(
  executor: Executor,
  params: { userId: string; reason: string; exceptSessionId?: string },
): Promise<number> {
  const revoked = await executor
    .update(authSessions)
    .set({ revokedAt: new Date(), revokedReason: params.reason })
    .where(
      and(
        eq(authSessions.userId, params.userId),
        isNull(authSessions.revokedAt),
        params.exceptSessionId ? ne(authSessions.id, params.exceptSessionId) : undefined,
      ),
    )
    .returning({ id: authSessions.id });
  return revoked.length;
}

export async function markSessionMfaVerified(executor: Executor, sessionId: string): Promise<void> {
  await executor
    .update(authSessions)
    .set({ mfaVerifiedAt: new Date() })
    .where(eq(authSessions.id, sessionId));
}

/** Whether the session's second factor is recent enough for staff operations. */
export function isMfaFresh(session: Pick<SessionRecord, "mfaVerifiedAt">): boolean {
  if (!session.mfaVerifiedAt) return false;
  const maxAgeMs = getEnv().STAFF_MFA_MAX_AGE_HOURS * 60 * 60_000;
  return Date.now() - session.mfaVerifiedAt.getTime() < maxAgeMs;
}
