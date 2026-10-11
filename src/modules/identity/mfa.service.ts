import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { ACADEMY } from "@/config/academy";
import { getDb, type Executor } from "@/server/db/client";
import { authMfaFactors, authRecoveryCodes } from "@/server/db/schema";
import { uuidv7 } from "@/server/db/uuid";
import { decrypt, encrypt, keyedHash } from "@/server/crypto";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { enforceRateLimit } from "@/server/rate-limit";
import { recordAudit } from "../audit/audit.service";
import type { Actor } from "../access/actor";
import { markSessionMfaVerified } from "./session.service";
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from "./totp";

const RECOVERY_CODE_COUNT = 10;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function factorContext(factorId: string) {
  return `mfa_factor:${factorId}:secret`;
}

function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (const byte of bytes) code += CROCKFORD[byte & 31];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export async function hasConfirmedMfa(executor: Executor, userId: string): Promise<boolean> {
  const [factor] = await executor
    .select({ id: authMfaFactors.id })
    .from(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.userId, userId),
        isNull(authMfaFactors.disabledAt),
        isNotNull(authMfaFactors.confirmedAt),
      ),
    );
  return !!factor;
}

/** Starts TOTP enrolment: returns the secret once (for the QR code / manual entry). */
export async function beginTotpEnrollment(
  actor: Actor,
): Promise<{ secret: string; otpauthUri: string }> {
  const db = getDb();
  if (await hasConfirmedMfa(db, actor.userId)) throw new AppError("MFA_ALREADY_ENROLLED");

  // Discard abandoned enrolments, then store the new (unconfirmed) factor.
  await db
    .delete(authMfaFactors)
    .where(and(eq(authMfaFactors.userId, actor.userId), isNull(authMfaFactors.confirmedAt)));
  const id = uuidv7();
  const secret = generateTotpSecret();
  await db.insert(authMfaFactors).values({
    id,
    userId: actor.userId,
    type: "totp",
    secretCiphertext: encrypt(secret, factorContext(id)),
  });
  return {
    secret,
    otpauthUri: buildOtpauthUri({ secret, accountName: actor.email, issuer: ACADEMY.shortName }),
  };
}

/** Confirms enrolment with a first valid code; returns one-time recovery codes. */
export async function confirmTotpEnrollment(
  actor: Actor,
  code: string,
  meta: RequestMeta,
): Promise<{ recoveryCodes: string[] }> {
  await enforceRateLimit("mfa:verify:user", actor.userId);
  const db = getDb();
  const [factor] = await db
    .select()
    .from(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.userId, actor.userId),
        isNull(authMfaFactors.confirmedAt),
        isNull(authMfaFactors.disabledAt),
      ),
    )
    .orderBy(desc(authMfaFactors.createdAt))
    .limit(1);
  if (!factor) throw new AppError("MFA_NOT_ENROLLED");

  const step = verifyTotp(decrypt(factor.secretCiphertext, factorContext(factor.id)), code);
  if (step === null) throw new AppError("MFA_INVALID");

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await db.transaction(async (tx) => {
    await tx
      .update(authMfaFactors)
      .set({ confirmedAt: new Date(), lastUsedStep: step })
      .where(eq(authMfaFactors.id, factor.id));
    await tx.delete(authRecoveryCodes).where(eq(authRecoveryCodes.userId, actor.userId));
    await tx.insert(authRecoveryCodes).values(
      recoveryCodes.map((recoveryCode) => ({
        userId: actor.userId,
        codeHash: keyedHash("mfa-recovery-code", normalizeRecoveryCode(recoveryCode)),
      })),
    );
    await markSessionMfaVerified(tx, actor.sessionId);
    await recordAudit(tx, {
      action: "auth.mfa_enrolled",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: actor.userId,
      meta,
    });
  });
  return { recoveryCodes };
}

/**
 * Completes the second factor for the current session with a TOTP code or a
 * single-use recovery code. TOTP codes cannot be replayed (time-step check).
 */
export async function verifyMfa(actor: Actor, code: string, meta: RequestMeta): Promise<void> {
  await enforceRateLimit("mfa:verify:user", actor.userId);
  const db = getDb();
  const trimmed = code.trim();

  if (/^[0-9A-Za-z]{5}-?[0-9A-Za-z]{5}$/.test(trimmed) && !/^\d+$/.test(trimmed.replace("-", ""))) {
    const used = await db
      .update(authRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authRecoveryCodes.userId, actor.userId),
          eq(
            authRecoveryCodes.codeHash,
            keyedHash("mfa-recovery-code", normalizeRecoveryCode(trimmed)),
          ),
          isNull(authRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: authRecoveryCodes.id });
    if (used.length === 0) return failMfa(actor, meta, "recovery_code_invalid");
    await markSessionMfaVerified(db, actor.sessionId);
    await recordAudit(db, {
      action: "auth.mfa_recovery_code_used",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: actor.userId,
      meta,
    });
    return;
  }

  const [factor] = await db
    .select()
    .from(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.userId, actor.userId),
        isNotNull(authMfaFactors.confirmedAt),
        isNull(authMfaFactors.disabledAt),
      ),
    );
  if (!factor) throw new AppError("MFA_NOT_ENROLLED");

  const step = verifyTotp(decrypt(factor.secretCiphertext, factorContext(factor.id)), trimmed, {
    afterStep: factor.lastUsedStep,
  });
  if (step === null) return failMfa(actor, meta, "totp_invalid");

  // Conditional update closes the race where the same code is submitted twice.
  const accepted = await db
    .update(authMfaFactors)
    .set({ lastUsedStep: step })
    .where(
      and(
        eq(authMfaFactors.id, factor.id),
        or(isNull(authMfaFactors.lastUsedStep), lt(authMfaFactors.lastUsedStep, step)),
      ),
    )
    .returning({ id: authMfaFactors.id });
  if (accepted.length === 0) return failMfa(actor, meta, "totp_replay");

  await markSessionMfaVerified(db, actor.sessionId);
  await recordAudit(db, {
    action: "auth.mfa_verified",
    actorUserId: actor.userId,
    targetType: "session",
    targetId: actor.sessionId,
    meta,
  });
}

async function failMfa(actor: Actor, meta: RequestMeta, reason: string): Promise<never> {
  await recordAudit(getDb(), {
    action: "auth.mfa_failed",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: actor.userId,
    meta,
    metadata: { reason },
  });
  throw new AppError("MFA_INVALID");
}
