import "server-only";
import { eq } from "drizzle-orm";
import type { Locale } from "@/i18n/config";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { enforceRateLimit } from "@/server/rate-limit";
import { sendEmail } from "@/server/email/send";
import { renderNoAccountEmail, renderOtpEmail } from "@/server/email/templates";
import { isLocale } from "@/i18n/config";
import { recordAudit } from "../audit/audit.service";
import { isStaffRoleSet, loadUserAccess } from "../access/rbac.service";
import {
  checkOtpCode,
  consumeOtpChallenge,
  getChallengeEmail,
  issueOtpChallenge,
  OTP_TTL_MINUTES,
} from "./otp.service";
import { createSession } from "./session.service";
import { findUserByEmail } from "./users.service";

export type LoginResult = {
  token: string;
  expiresAt: Date;
  userId: string;
  isStaff: boolean;
  locale: Locale;
};

/**
 * Step 1 of e-mail OTP sign-in. The response is identical whether or not the
 * address has an account (no user enumeration): unknown addresses receive a
 * "no account found" e-mail and an undeliverable decoy challenge instead.
 */
export async function requestLoginCode(params: {
  email: string;
  locale: Locale;
  meta: RequestMeta;
}): Promise<{ challengeId: string; expiresAt: Date }> {
  await enforceRateLimit("otp:request:ip", params.meta.ip);
  await enforceRateLimit("otp:request:email", params.email);
  await enforceRateLimit("otp:request:email:daily", params.email);

  const db = getDb();
  const user = await findUserByEmail(db, params.email);
  const hasAccount = !!user && user.status !== "deleted";

  const { challenge, code } = await issueOtpChallenge(db, {
    purpose: "login",
    email: params.email,
    userId: hasAccount ? user.id : null,
    meta: params.meta,
    deliverable: hasAccount,
  });

  const locale = hasAccount && isLocale(user.locale) ? user.locale : params.locale;
  if (hasAccount) {
    await sendEmail({
      to: params.email,
      template: "otp.login",
      locale,
      userId: user.id,
      rendered: renderOtpEmail({ locale, purpose: "login", code, expiresInMinutes: OTP_TTL_MINUTES }),
    });
  } else {
    await sendEmail({
      to: params.email,
      template: "login.no_account",
      locale,
      rendered: renderNoAccountEmail({
        locale,
        activationUrl: `${getEnv().APP_URL}/${locale}/activate`,
      }),
    });
  }
  return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
}

/**
 * Step 2: verifies the code and opens a session. Attempt counting happens
 * before (and independently of) the session transaction.
 */
export async function completeLogin(params: {
  challengeId: string;
  code: string;
  meta: RequestMeta;
}): Promise<LoginResult> {
  await enforceRateLimit("otp:verify:ip", params.meta.ip);
  const db = getDb();
  await enforceRateLimit("otp:verify:email:daily", await getChallengeEmail(db, params.challengeId));

  let challenge;
  try {
    challenge = await checkOtpCode(db, {
      challengeId: params.challengeId,
      code: params.code,
      purpose: "login",
    });
  } catch (error) {
    if (error instanceof AppError) {
      await recordAudit(db, {
        action: "auth.login_failed",
        targetType: "otp_challenge",
        targetId: params.challengeId,
        meta: params.meta,
        metadata: { reason: error.code },
      });
    }
    throw error;
  }
  if (!challenge.userId) throw new AppError("OTP_INVALID");
  const userId = challenge.userId;

  return db.transaction(async (tx) => {
    await consumeOtpChallenge(tx, challenge.id);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user || user.status === "deleted") throw new AppError("OTP_INVALID");
    if (user.status === "suspended") throw new AppError("ACCOUNT_SUSPENDED");

    const now = new Date();
    await tx
      .update(users)
      .set({ lastLoginAt: now, emailVerifiedAt: user.emailVerifiedAt ?? now })
      .where(eq(users.id, user.id));

    const access = await loadUserAccess(tx, user.id);
    const { token, session } = await createSession(tx, { userId: user.id, meta: params.meta });
    await recordAudit(tx, {
      action: "auth.login",
      actorUserId: user.id,
      targetType: "session",
      targetId: session.id,
      meta: params.meta,
    });
    return {
      token,
      expiresAt: session.expiresAt,
      userId: user.id,
      isStaff: isStaffRoleSet(access.roles),
      locale: isLocale(user.locale) ? user.locale : "ar",
    };
  });
}
