import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { authOtpChallenges } from "@/server/db/schema";
import { uuidv7 } from "@/server/db/uuid";
import { keyedHash, randomDigits, verifyKeyedHash } from "@/server/crypto";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import type { OtpPurpose } from "@/shared/enums";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpChallenge = typeof authOtpChallenges.$inferSelect;

/** The digest binds the code to its challenge id, so codes are never reusable across challenges. */
function digest(challengeId: string, code: string): string {
  return keyedHash("otp-code", `${challengeId}:${code}`);
}

/**
 * Issues a new challenge and returns the plaintext code (to be e-mailed, never
 * stored or logged). Earlier open challenges for the same e-mail and purpose
 * are invalidated, so only the most recent code works.
 */
export async function issueOtpChallenge(
  executor: Executor,
  params: {
    purpose: OtpPurpose;
    email: string;
    userId?: string | null;
    activationCodeId?: string | null;
    metadata?: Record<string, unknown>;
    meta: RequestMeta;
    /** When false, the code is random and never sent (enumeration-safe decoy). */
    deliverable?: boolean;
  },
): Promise<{ challenge: OtpChallenge; code: string }> {
  const id = uuidv7();
  const code = randomDigits(OTP_LENGTH);
  const now = new Date();

  await executor
    .update(authOtpChallenges)
    .set({ invalidatedAt: now })
    .where(
      and(
        eq(authOtpChallenges.email, params.email),
        eq(authOtpChallenges.purpose, params.purpose),
        isNull(authOtpChallenges.consumedAt),
        isNull(authOtpChallenges.invalidatedAt),
        gt(authOtpChallenges.expiresAt, now),
      ),
    );

  const [challenge] = await executor
    .insert(authOtpChallenges)
    .values({
      id,
      purpose: params.purpose,
      email: params.email,
      userId: params.userId ?? null,
      activationCodeId: params.activationCodeId ?? null,
      codeHash: digest(id, code),
      maxAttempts: OTP_MAX_ATTEMPTS,
      expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
      metadata: { ...(params.metadata ?? {}), deliverable: params.deliverable ?? true },
      ipAddress: params.meta.ip,
      userAgent: params.meta.userAgent,
    })
    .returning();
  if (!challenge) throw new Error("Failed to create OTP challenge");
  return { challenge, code };
}

/**
 * Step 1 of verification, run OUTSIDE the business transaction so the attempt
 * counter is committed even when the code is wrong: atomically consumes one
 * attempt on an open challenge and checks the code.
 * Returns the challenge when the code is correct, otherwise throws.
 */
export async function checkOtpCode(
  executor: Executor,
  params: { challengeId: string; code: string; purpose: OtpPurpose },
): Promise<OtpChallenge> {
  const [challenge] = await executor
    .update(authOtpChallenges)
    .set({ attempts: sql`${authOtpChallenges.attempts} + 1` })
    .where(
      and(
        eq(authOtpChallenges.id, params.challengeId),
        eq(authOtpChallenges.purpose, params.purpose),
        isNull(authOtpChallenges.consumedAt),
        isNull(authOtpChallenges.invalidatedAt),
        gt(authOtpChallenges.expiresAt, sql`now()`),
        sql`${authOtpChallenges.attempts} < ${authOtpChallenges.maxAttempts}`,
      ),
    )
    .returning();

  if (!challenge) {
    const [existing] = await executor
      .select()
      .from(authOtpChallenges)
      .where(eq(authOtpChallenges.id, params.challengeId));
    if (
      !existing ||
      existing.purpose !== params.purpose ||
      existing.consumedAt ||
      existing.invalidatedAt
    ) {
      throw new AppError("OTP_INVALID");
    }
    if (existing.expiresAt.getTime() <= Date.now()) throw new AppError("OTP_EXPIRED");
    throw new AppError("OTP_TOO_MANY_ATTEMPTS");
  }

  const normalized = params.code.replace(/\s+/g, "");
  if (
    !/^\d{6}$/.test(normalized) ||
    !verifyKeyedHash("otp-code", `${challenge.id}:${normalized}`, challenge.codeHash)
  ) {
    const attemptsRemaining = Math.max(0, challenge.maxAttempts - challenge.attempts);
    throw new AppError(attemptsRemaining > 0 ? "OTP_INVALID" : "OTP_TOO_MANY_ATTEMPTS", undefined, {
      attemptsRemaining,
    });
  }
  return challenge;
}

/** E-mail a challenge was issued to (used to apply per-address verify limits). */
export async function getChallengeEmail(
  executor: Executor,
  challengeId: string,
): Promise<string | null> {
  const [row] = await executor
    .select({ email: authOtpChallenges.email })
    .from(authOtpChallenges)
    .where(eq(authOtpChallenges.id, challengeId));
  return row?.email ?? null;
}

/**
 * Step 2, inside the business transaction: marks the challenge consumed.
 * The conditional update guarantees single use under concurrency.
 */
export async function consumeOtpChallenge(executor: Executor, challengeId: string): Promise<void> {
  const consumed = await executor
    .update(authOtpChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authOtpChallenges.id, challengeId),
        isNull(authOtpChallenges.consumedAt),
        isNull(authOtpChallenges.invalidatedAt),
      ),
    )
    .returning({ id: authOtpChallenges.id });
  if (consumed.length === 0) throw new AppError("OTP_INVALID");
}
