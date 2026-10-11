import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { userEmailChanges, users } from "@/server/db/schema";
import { AppError, isUniqueViolation } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { enforceRateLimit } from "@/server/rate-limit";
import { sendEmail } from "@/server/email/send";
import { renderEmailChangedEmail, renderOtpEmail } from "@/server/email/templates";
import { logger } from "@/server/logger";
import { recordAudit } from "../audit/audit.service";
import type { Actor } from "../access/actor";
import { maskEmail } from "./email";
import {
  checkOtpCode,
  consumeOtpChallenge,
  getChallengeEmail,
  issueOtpChallenge,
  OTP_TTL_MINUTES,
} from "./otp.service";
import { revokeAllSessions } from "./session.service";
import { findUserByEmail } from "./users.service";

/**
 * Self-service e-mail change. Requires a recent sign-in, proves control of the
 * new address with an OTP, notifies the old address, and signs out every other
 * device. If the new address belongs to another account, the response is the
 * same but no code is sent (no account enumeration).
 */
export async function startEmailChange(
  actor: Actor,
  params: { newEmail: string },
  meta: RequestMeta,
): Promise<{ challengeId: string; emailMasked: string }> {
  if (params.newEmail === actor.email)
    throw new AppError("VALIDATION_ERROR", "same e-mail", { field: "newEmail" });
  await enforceRateLimit("otp:request:email", params.newEmail);
  await enforceRateLimit("otp:request:email:daily", actor.email);
  const db = getDb();
  const taken = !!(await findUserByEmail(db, params.newEmail));
  const { challenge, code } = await issueOtpChallenge(db, {
    purpose: "email_change",
    email: params.newEmail,
    userId: actor.userId,
    metadata: { previousEmail: actor.email },
    meta,
    deliverable: !taken,
  });
  if (!taken) {
    await sendEmail({
      to: params.newEmail,
      template: "otp.email_change",
      locale: actor.locale,
      userId: actor.userId,
      rendered: renderOtpEmail({
        locale: actor.locale,
        purpose: "email_change",
        code,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    });
  }
  return { challengeId: challenge.id, emailMasked: maskEmail(params.newEmail) };
}

export async function confirmEmailChange(
  actor: Actor,
  params: { challengeId: string; code: string },
  meta: RequestMeta,
): Promise<{ email: string }> {
  await enforceRateLimit("otp:verify:ip", meta.ip);
  const db = getDb();
  await enforceRateLimit("otp:verify:email:daily", await getChallengeEmail(db, params.challengeId));
  const challenge = await checkOtpCode(db, {
    challengeId: params.challengeId,
    code: params.code,
    purpose: "email_change",
  });
  if (challenge.userId !== actor.userId) throw new AppError("OTP_INVALID");
  const newEmail = challenge.email;
  const oldEmail = actor.email;

  try {
    await db.transaction(async (tx) => {
      await consumeOtpChallenge(tx, challenge.id);
      await tx
        .update(users)
        .set({ email: newEmail, emailVerifiedAt: new Date() })
        .where(eq(users.id, actor.userId));
      await tx.insert(userEmailChanges).values({
        userId: actor.userId,
        oldEmail,
        newEmail,
        changedBy: actor.userId,
        reason: "self_service",
      });
      await revokeAllSessions(tx, {
        userId: actor.userId,
        reason: "email_changed",
        exceptSessionId: actor.sessionId,
      });
      await recordAudit(tx, {
        action: "auth.email_changed",
        actorUserId: actor.userId,
        targetType: "user",
        targetId: actor.userId,
        meta,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "users_email_key")) throw new AppError("EMAIL_IN_USE");
    throw error;
  }

  await sendEmail({
    to: oldEmail,
    template: "account.email_changed",
    locale: actor.locale,
    userId: actor.userId,
    rendered: renderEmailChangedEmail({
      locale: actor.locale,
      newEmailMasked: maskEmail(newEmail),
    }),
  }).catch((error: unknown) => logger.warn("email-changed notification failed", { error }));
  return { email: newEmail };
}
