import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Locale } from "@/i18n/config";
import { isLocale } from "@/i18n/config";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import {
  activationBatches,
  activationCodes,
  courses,
  customers,
  orders,
  users,
} from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { enforceRateLimit } from "@/server/rate-limit";
import { sendEmail } from "@/server/email/send";
import { renderOtpEmail } from "@/server/email/templates";
import type { LocalizedText } from "@/server/db/schema";
import { recordAudit } from "../audit/audit.service";
import { maskEmail } from "../identity/email";
import {
  checkOtpCode,
  consumeOtpChallenge,
  getChallengeEmail,
  issueOtpChallenge,
  OTP_TTL_MINUTES,
} from "../identity/otp.service";
import { createSession } from "../identity/session.service";
import { findOrCreateVerifiedUser } from "../identity/users.service";
import { grantFromActivationCode } from "../entitlements/entitlements.service";
import {
  hashCardCode,
  MAX_FAILED_PIN_ATTEMPTS,
  normalizeCardCode,
  normalizeCardPin,
  verifyCardPin,
} from "./codes";
import { recordActivationEvents } from "./events";

type CodeRow = typeof activationCodes.$inferSelect;
type BatchRow = typeof activationBatches.$inferSelect;

/**
 * Card states that block redemption, checked in this order. Shared by the
 * pre-check, the PIN step and the final transaction so the user always gets
 * the same answer for the same card.
 */
function assertRedeemable(code: CodeRow, batch: BatchRow): void {
  if (code.status === "activated") throw new AppError("ACTIVATION_CODE_ALREADY_USED");
  if (code.status === "revoked" || batch.status !== "active")
    throw new AppError("ACTIVATION_CODE_REVOKED");
  if (code.lockedAt) throw new AppError("ACTIVATION_CODE_LOCKED");
  if (batch.redeemBy && batch.redeemBy.getTime() <= Date.now()) {
    throw new AppError("ACTIVATION_CODE_EXPIRED");
  }
  if (batch.requiresSale && code.status !== "sold") {
    // Packed in a customer's parcel: unlocked when the carrier reports delivery.
    throw new AppError(code.orderId ? "ACTIVATION_AWAITING_DELIVERY" : "ACTIVATION_CODE_NOT_SOLD");
  }
}

async function loadCardByCode(executor: Executor, rawCode: string, lock: boolean) {
  const normalized = normalizeCardCode(rawCode);
  if (!normalized) throw new AppError("ACTIVATION_CODE_INVALID");
  const query = executor
    .select({ code: activationCodes, batch: activationBatches })
    .from(activationCodes)
    .innerJoin(activationBatches, eq(activationBatches.id, activationCodes.batchId))
    .where(eq(activationCodes.codeHash, hashCardCode(normalized)));
  const [row] = lock ? await query.for("update", { of: activationCodes }) : await query;
  if (!row) throw new AppError("ACTIVATION_CODE_INVALID");
  return row;
}

export type ActivationCheckResult = {
  requiresPin: boolean;
  course: { title: LocalizedText };
};

/** Step 1 (page load after scanning): is this card redeemable? */
export async function checkActivationCode(params: {
  code: string;
  meta: RequestMeta;
}): Promise<ActivationCheckResult> {
  await enforceRateLimit("activation:check:ip", params.meta.ip);
  const db = getDb();
  const { code, batch } = await loadCardByCode(db, params.code, false);
  assertRedeemable(code, batch);
  const [course] = await db
    .select({ title: courses.title })
    .from(courses)
    .where(eq(courses.id, batch.courseId));
  return { requiresPin: batch.requiresPin, course: { title: course?.title ?? {} } };
}

/**
 * Step 2: verify the scratch-off PIN, then e-mail an OTP bound to this card.
 * Failed PIN attempts are committed before the error is returned; the card
 * locks after MAX_FAILED_PIN_ATTEMPTS and needs staff to unlock it.
 */
export async function startActivation(params: {
  code: string;
  pin?: string | null;
  email: string;
  locale: Locale;
  meta: RequestMeta;
}): Promise<{ challengeId: string; expiresAt: Date; emailMasked: string }> {
  await enforceRateLimit("activation:start:ip", params.meta.ip);
  const db = getDb();

  const outcome = await db.transaction(async (tx) => {
    const { code, batch } = await loadCardByCode(tx, params.code, true);
    assertRedeemable(code, batch);
    if (!batch.requiresPin) return { ok: true as const, code, batch };

    const pin = params.pin ? normalizeCardPin(params.pin) : null;
    if (!pin) return { ok: false as const, error: new AppError("ACTIVATION_PIN_REQUIRED") };
    if (code.pinHash && verifyCardPin(code.id, pin, code.pinHash))
      return { ok: true as const, code, batch };

    const failed = code.failedPinAttempts + 1;
    const locked = failed >= MAX_FAILED_PIN_ATTEMPTS;
    await tx
      .update(activationCodes)
      .set({ failedPinAttempts: failed, lockedAt: locked ? new Date() : null })
      .where(eq(activationCodes.id, code.id));
    await recordActivationEvents(tx, [
      {
        type: "pin_failed",
        batchId: batch.id,
        codeId: code.id,
        meta: params.meta,
        metadata: { failed },
      },
      ...(locked
        ? [{ type: "code_locked" as const, batchId: batch.id, codeId: code.id, meta: params.meta }]
        : []),
    ]);
    return {
      ok: false as const,
      error: locked
        ? new AppError("ACTIVATION_CODE_LOCKED")
        : new AppError("ACTIVATION_PIN_INVALID", undefined, {
            attemptsRemaining: MAX_FAILED_PIN_ATTEMPTS - failed,
          }),
    };
  });
  if (!outcome.ok) throw outcome.error;

  // E-mail quotas apply to OTP issuance only (PIN guessing is bounded per card and per IP).
  await enforceRateLimit("otp:request:email", params.email);
  await enforceRateLimit("otp:request:email:daily", params.email);
  const { challenge, code } = await issueOtpChallenge(db, {
    purpose: "activation",
    email: params.email,
    activationCodeId: outcome.code.id,
    metadata: { locale: params.locale },
    meta: params.meta,
  });
  await sendEmail({
    to: params.email,
    template: "otp.activation",
    locale: params.locale,
    rendered: renderOtpEmail({
      locale: params.locale,
      purpose: "activation",
      code,
      expiresInMinutes: OTP_TTL_MINUTES,
    }),
  });
  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    emailMasked: maskEmail(params.email),
  };
}

export type ActivationResult = {
  token: string;
  expiresAt: Date;
  userId: string;
  accountCreated: boolean;
  courseId: string;
};

/**
 * Step 3: the e-mail is proven, redeem the card atomically.
 *
 * Everything below happens in ONE transaction: consume the OTP, lock the card
 * row, create or link the account, grant lifetime access, mark the card
 * activated (wiping its printable secrets), write events/audit, open a
 * session. Any failure rolls back all of it: there is never a consumed card
 * without access, nor access without a consumed card. Concurrent attempts on
 * the same card serialise on the row lock; the loser sees ALREADY_USED.
 */
export async function completeActivation(
  params: { challengeId: string; otp: string; meta: RequestMeta },
  testHooks?: { beforeCommit?: (tx: Transaction) => Promise<void> },
): Promise<ActivationResult> {
  await enforceRateLimit("otp:verify:ip", params.meta.ip);
  const db = getDb();
  await enforceRateLimit("otp:verify:email:daily", await getChallengeEmail(db, params.challengeId));
  const challenge = await checkOtpCode(db, {
    challengeId: params.challengeId,
    code: params.otp,
    purpose: "activation",
  });
  const activationCodeId = challenge.activationCodeId;
  if (!activationCodeId) throw new AppError("OTP_INVALID");
  const locale = isLocale(challenge.metadata.locale) ? challenge.metadata.locale : "ar";

  try {
    return await db.transaction(async (tx) => {
      await consumeOtpChallenge(tx, challenge.id);

      const [row] = await tx
        .select({ code: activationCodes, batch: activationBatches })
        .from(activationCodes)
        .innerJoin(activationBatches, eq(activationBatches.id, activationCodes.batchId))
        .where(eq(activationCodes.id, activationCodeId))
        .for("update", { of: activationCodes });
      if (!row) throw new AppError("ACTIVATION_CODE_INVALID");
      const { code, batch } = row;
      assertRedeemable(code, batch);

      const { user, created } = await findOrCreateVerifiedUser(tx, {
        email: challenge.email,
        locale,
        meta: params.meta,
      });
      if (user.status === "suspended") throw new AppError("ACCOUNT_SUSPENDED");
      if (user.status !== "active") throw new AppError("FORBIDDEN");

      const entitlement = await grantFromActivationCode(tx, {
        userId: user.id,
        courseId: batch.courseId,
        activationCodeId: code.id,
      });

      const now = new Date();
      await tx
        .update(activationCodes)
        .set({
          status: "activated",
          activatedAt: now,
          activatedByUserId: user.id,
          codeCiphertext: null,
          pinCiphertext: null,
          lockedAt: null,
        })
        .where(eq(activationCodes.id, code.id));
      await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
      if (code.orderId) {
        // Link the delivery customer to the student account (support: order <-> student).
        await tx
          .update(customers)
          .set({ userId: user.id })
          .where(
            and(
              isNull(customers.userId),
              sql`${customers.id} = (select ${orders.customerId} from ${orders} where ${orders.id} = ${code.orderId})`,
            ),
          );
      }

      await recordActivationEvents(tx, [
        {
          type: "code_activated",
          batchId: batch.id,
          codeId: code.id,
          actorUserId: user.id,
          meta: params.meta,
          metadata: { entitlementId: entitlement.id, accountCreated: created },
        },
      ]);
      await recordAudit(tx, {
        action: "activation.code_redeemed",
        actorUserId: user.id,
        targetType: "activation_code",
        targetId: code.id,
        meta: params.meta,
        metadata: { serial: code.serial, batchId: batch.id, entitlementId: entitlement.id },
      });

      const { token, session } = await createSession(tx, { userId: user.id, meta: params.meta });
      await testHooks?.beforeCommit?.(tx);
      return {
        token,
        expiresAt: session.expiresAt,
        userId: user.id,
        accountCreated: created,
        courseId: batch.courseId,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      await recordRejection(db, activationCodeId, error.code, params.meta);
    }
    throw error;
  }
}

async function recordRejection(
  executor: Executor,
  codeId: string,
  reason: string,
  meta: RequestMeta,
) {
  const [code] = await executor
    .select({ batchId: activationCodes.batchId })
    .from(activationCodes)
    .where(eq(activationCodes.id, codeId));
  if (!code) return;
  await recordActivationEvents(executor, [
    { type: "redemption_rejected", batchId: code.batchId, codeId, meta, metadata: { reason } },
  ]).catch(() => undefined);
}

/** Number of cards redeemed by a user (dashboard / support views). */
export async function countRedeemedByUser(executor: Executor, userId: string): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(activationCodes)
    .where(eq(activationCodes.activatedByUserId, userId));
  return row?.count ?? 0;
}
