import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { completeLogin, requestLoginCode } from "@/modules/identity/auth.service";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  hasConfirmedMfa,
  verifyMfa,
} from "@/modules/identity/mfa.service";
import { OTP_MAX_ATTEMPTS } from "@/modules/identity/otp.service";
import {
  createSession,
  listActiveSessions,
  revokeAllSessions,
  revokeSession,
  validateSessionToken,
} from "@/modules/identity/session.service";
import { totp } from "@/modules/identity/totp";
import { closeDb, getDb } from "@/server/db/client";
import { authOtpChallenges, authSessions, users } from "@/server/db/schema";
import {
  actorFor,
  createUser,
  expectAppError,
  installMemoryTransport,
  resetDatabase,
  testMeta,
  type MemoryTransport,
} from "./helpers";

let mail: MemoryTransport;

beforeEach(async () => {
  await resetDatabase();
  mail = installMemoryTransport();
});

afterAll(async () => {
  await closeDb();
});

describe("e-mail OTP sign-in", () => {
  it("signs in an existing account and records the login", async () => {
    const userId = await createUser("student@example.com");
    const { challengeId } = await requestLoginCode({
      email: "student@example.com",
      locale: "fr",
      meta: testMeta(),
    });
    const message = mail.lastTo("student@example.com");
    expect(message?.template).toBe("otp.login");

    const login = await completeLogin({
      challengeId,
      code: mail.otpFor("student@example.com"),
      meta: testMeta(),
    });
    expect(login.userId).toBe(userId);
    const [user] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(user?.lastLoginAt).toBeInstanceOf(Date);
  });

  it("stores only a digest of the code", async () => {
    await createUser("digest@example.com");
    const { challengeId } = await requestLoginCode({
      email: "digest@example.com",
      locale: "ar",
      meta: testMeta(),
    });
    const code = mail.otpFor("digest@example.com");
    const [challenge] = await getDb()
      .select()
      .from(authOtpChallenges)
      .where(eq(authOtpChallenges.id, challengeId));
    expect(challenge?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge?.codeHash).not.toContain(code);
  });

  it("does not reveal whether an e-mail has an account", async () => {
    const response = await requestLoginCode({
      email: "nobody@example.com",
      locale: "ar",
      meta: testMeta(),
    });
    expect(response.challengeId).toBeTruthy();
    expect(mail.lastTo("nobody@example.com")?.template).toBe("login.no_account");
    expect(mail.lastTo("nobody@example.com")?.text).not.toMatch(/\b\d{6}\b/);
    // No code was e-mailed, and guessing cannot create an account.
    await expectAppError(
      completeLogin({ challengeId: response.challengeId, code: "123456", meta: testMeta() }),
      "OTP_INVALID",
    );
    expect(
      await getDb().select().from(users).where(eq(users.email, "nobody@example.com")),
    ).toHaveLength(0);
  });

  it("limits verification attempts per code", async () => {
    await createUser("brute@example.com");
    const { challengeId } = await requestLoginCode({
      email: "brute@example.com",
      locale: "ar",
      meta: testMeta(),
    });
    const right = mail.otpFor("brute@example.com");
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i += 1) {
      await expectAppError(
        completeLogin({ challengeId, code: wrong, meta: testMeta() }),
        "OTP_INVALID",
      );
    }
    await expectAppError(
      completeLogin({ challengeId, code: wrong, meta: testMeta() }),
      "OTP_TOO_MANY_ATTEMPTS",
    );
    // Even the correct code is refused once attempts are exhausted.
    await expectAppError(
      completeLogin({ challengeId, code: right, meta: testMeta() }),
      "OTP_TOO_MANY_ATTEMPTS",
    );
  });

  it("rejects expired codes", async () => {
    await createUser("late@example.com");
    const { challengeId } = await requestLoginCode({
      email: "late@example.com",
      locale: "ar",
      meta: testMeta(),
    });
    await getDb()
      .update(authOtpChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authOtpChallenges.id, challengeId));
    await expectAppError(
      completeLogin({ challengeId, code: mail.otpFor("late@example.com"), meta: testMeta() }),
      "OTP_EXPIRED",
    );
  });

  it("codes are single use", async () => {
    await createUser("once@example.com");
    const { challengeId } = await requestLoginCode({
      email: "once@example.com",
      locale: "ar",
      meta: testMeta(),
    });
    const code = mail.otpFor("once@example.com");
    await completeLogin({ challengeId, code, meta: testMeta() });
    await expectAppError(completeLogin({ challengeId, code, meta: testMeta() }), "OTP_INVALID");
  });

  it("a newer code invalidates the previous one", async () => {
    await createUser("twice@example.com");
    const first = await requestLoginCode({
      email: "twice@example.com",
      locale: "ar",
      meta: testMeta(),
    });
    const firstCode = mail.otpFor("twice@example.com");
    await requestLoginCode({ email: "twice@example.com", locale: "ar", meta: testMeta() });
    await expectAppError(
      completeLogin({ challengeId: first.challengeId, code: firstCode, meta: testMeta() }),
      "OTP_INVALID",
    );
  });

  it("rate-limits code requests per e-mail", async () => {
    await createUser("spam@example.com");
    for (let i = 0; i < 5; i += 1) {
      await requestLoginCode({ email: "spam@example.com", locale: "ar", meta: testMeta() });
    }
    await expectAppError(
      requestLoginCode({ email: "spam@example.com", locale: "ar", meta: testMeta() }),
      "RATE_LIMITED",
    );
  });

  it("refuses suspended accounts", async () => {
    const userId = await createUser("suspended@example.com");
    await getDb()
      .update(users)
      .set({ status: "suspended", suspendedAt: new Date(), suspendedReason: "test" })
      .where(eq(users.id, userId));
    const { challengeId } = await requestLoginCode({
      email: "suspended@example.com",
      locale: "ar",
      meta: testMeta(),
    });
    await expectAppError(
      completeLogin({ challengeId, code: mail.otpFor("suspended@example.com"), meta: testMeta() }),
      "ACCOUNT_SUSPENDED",
    );
  });
});

describe("sessions and devices", () => {
  it("revokes a single device and all other devices", async () => {
    const userId = await createUser("devices@example.com");
    const db = getDb();
    const a = await createSession(db, { userId, meta: testMeta() });
    const b = await createSession(db, { userId, meta: testMeta() });
    const c = await createSession(db, { userId, meta: testMeta() });
    expect(await listActiveSessions(db, userId)).toHaveLength(3);

    expect(await revokeSession(db, { userId, sessionId: b.session.id, reason: "user" })).toBe(true);
    expect(await validateSessionToken(db, b.token)).toBeNull();

    expect(
      await revokeAllSessions(db, { userId, reason: "logout_all", exceptSessionId: a.session.id }),
    ).toBe(1);
    expect(await validateSessionToken(db, c.token)).toBeNull();
    expect(await validateSessionToken(db, a.token)).not.toBeNull();
  });

  it("cannot revoke another user's session", async () => {
    const owner = await createUser("owner@example.com");
    const attacker = await createUser("attacker@example.com");
    const { session, token } = await createSession(getDb(), { userId: owner, meta: testMeta() });
    expect(
      await revokeSession(getDb(), { userId: attacker, sessionId: session.id, reason: "x" }),
    ).toBe(false);
    expect(await validateSessionToken(getDb(), token)).not.toBeNull();
  });

  it("enforces the per-account device limit by revoking the oldest session", async () => {
    const userId = await createUser("sharer@example.com");
    const db = getDb();
    const first = await createSession(db, { userId, meta: testMeta() });
    await db
      .update(authSessions)
      .set({ lastSeenAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(authSessions.id, first.session.id));
    for (let i = 0; i < 5; i += 1) await createSession(db, { userId, meta: testMeta() });
    expect(await listActiveSessions(db, userId)).toHaveLength(5);
    expect(await validateSessionToken(db, first.token)).toBeNull();
  });

  it("stores only token digests", async () => {
    const userId = await createUser("hash@example.com");
    const { token, session } = await createSession(getDb(), { userId, meta: testMeta() });
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("invalidates sessions of suspended users immediately", async () => {
    const userId = await createUser("later-suspended@example.com");
    const { token } = await createSession(getDb(), { userId, meta: testMeta() });
    await getDb()
      .update(users)
      .set({ status: "suspended", suspendedAt: new Date(), suspendedReason: "abuse" })
      .where(eq(users.id, userId));
    expect(await validateSessionToken(getDb(), token)).toBeNull();
  });
});

describe("staff MFA (TOTP)", () => {
  it("enrols, issues recovery codes, and rejects code replay", async () => {
    const userId = await createUser("admin@example.com", ["admin"]);
    const actor = await actorFor(userId, { mfaVerified: false });
    const { secret, otpauthUri } = await beginTotpEnrollment(actor);
    expect(otpauthUri).toContain("otpauth://totp/");

    const code = totp(secret);
    const { recoveryCodes } = await confirmTotpEnrollment(actor, code, testMeta());
    expect(recoveryCodes).toHaveLength(10);
    expect(await hasConfirmedMfa(getDb(), userId)).toBe(true);

    // The enrolment code cannot be replayed for verification.
    await expectAppError(verifyMfa(actor, code, testMeta()), "MFA_INVALID");
    // A recovery code works exactly once.
    await verifyMfa(actor, recoveryCodes[0]!, testMeta());
    await expectAppError(verifyMfa(actor, recoveryCodes[0]!, testMeta()), "MFA_INVALID");
    // Next time step's code is accepted.
    await verifyMfa(actor, totp(secret, Date.now() + 30_000), testMeta());
  });

  it("refuses a second enrolment once confirmed", async () => {
    const userId = await createUser("admin2@example.com", ["admin"]);
    const actor = await actorFor(userId, { mfaVerified: false });
    const { secret } = await beginTotpEnrollment(actor);
    await confirmTotpEnrollment(actor, totp(secret), testMeta());
    await expectAppError(beginTotpEnrollment(actor), "MFA_ALREADY_ENROLLED");
  });
});
