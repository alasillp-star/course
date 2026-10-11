import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  markCardsSold,
  replaceCard,
  revokeCard,
  unlockCard,
} from "@/modules/activation/admin-codes.service";
import {
  createBatch,
  loadPrintableCards,
  purgeBatchSecrets,
} from "@/modules/activation/batches.service";
import { MAX_FAILED_PIN_ATTEMPTS } from "@/modules/activation/codes";
import {
  checkActivationCode,
  completeActivation,
  startActivation,
} from "@/modules/activation/redemption.service";
import type { Actor } from "@/modules/access/actor";
import { hasCourseAccess } from "@/modules/entitlements/entitlements.service";
import { completeLogin, requestLoginCode } from "@/modules/identity/auth.service";
import { validateSessionToken } from "@/modules/identity/session.service";
import { closeDb, getDb } from "@/server/db/client";
import {
  activationCodes,
  activationEvents,
  auditLogs,
  authOtpChallenges,
  authSessions,
  courseEntitlements,
  users,
} from "@/server/db/schema";
import {
  createCourse,
  createUser,
  expectAppError,
  installMemoryTransport,
  resetDatabase,
  staffActor,
  testMeta,
  type MemoryTransport,
} from "./helpers";

let mail: MemoryTransport;
let courseId: string;
let admin: Actor;

async function newBatch(
  options: { quantity?: number; requiresPin?: boolean; requiresSale?: boolean } = {},
) {
  const batch = await createBatch(
    admin,
    {
      name: "Test batch",
      courseId,
      quantity: options.quantity ?? 3,
      requiresPin: options.requiresPin ?? true,
      requiresSale: options.requiresSale ?? true,
    },
    testMeta(),
  );
  const { cards } = await loadPrintableCards(
    admin,
    { batchId: batch.id, from: 1, to: batch.quantity, format: "csv" },
    testMeta(),
  );
  return { batch, cards };
}

async function soldCard(options: { requiresPin?: boolean } = {}) {
  const { batch, cards } = await newBatch({ quantity: 1, requiresPin: options.requiresPin });
  const card = cards[0]!;
  await markCardsSold(admin, { serials: [card.serial] }, testMeta());
  return { batch, card };
}

/** Full happy-path redemption for `email`; returns the activation result. */
async function redeem(card: { code: string; pin: string | null }, email: string) {
  const started = await startActivation({
    code: card.code,
    pin: card.pin,
    email,
    locale: "fr",
    meta: testMeta(),
  });
  return completeActivation({
    challengeId: started.challengeId,
    otp: mail.otpFor(email),
    meta: testMeta(),
  });
}

beforeEach(async () => {
  await resetDatabase();
  mail = installMemoryTransport();
  courseId = await createCourse();
  admin = await staffActor("owner@academy.test", "super_admin");
});

afterAll(async () => {
  await closeDb();
});

describe("batch generation", () => {
  it("stores only digests and encrypted printable secrets", async () => {
    const { batch, cards } = await newBatch({ quantity: 25 });
    expect(batch.counts.total).toBe(25);
    expect(batch.counts.available).toBe(25);
    expect(cards).toHaveLength(25);
    expect(new Set(cards.map((card) => card.code)).size).toBe(25);

    const rows = await getDb()
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.batchId, batch.id));
    for (const row of rows) {
      const card = cards.find((candidate) => candidate.serial === row.serial)!;
      expect(row.codeHash).not.toContain(card.code);
      expect(row.codeCiphertext).not.toContain(card.code);
      expect(row.pinCiphertext).not.toContain(card.pin!);
      expect(row.serial).toMatch(/^B0001-\d{5}$/);
    }
    expect(cards[0]!.url).toMatch(/^http:\/\/localhost:3000\/a#[0-9A-Z]{16}$/);
  });

  it("generates 10,000 cards in one batch", async () => {
    const batch = await createBatch(
      admin,
      {
        name: "Large print run",
        courseId,
        quantity: 10_000,
        requiresPin: true,
        requiresSale: true,
      },
      testMeta(),
    );
    expect(batch.counts.total).toBe(10_000);
    const [{ value } = { value: 0 }] = await getDb()
      .select({ value: count() })
      .from(activationCodes)
      .where(eq(activationCodes.batchId, batch.id));
    expect(Number(value)).toBe(10_000);
  });

  it("refuses printable exports once secrets are purged", async () => {
    const { batch } = await newBatch();
    await purgeBatchSecrets(admin, batch.id, testMeta());
    await expectAppError(
      loadPrintableCards(admin, { batchId: batch.id, from: 1, to: 3, format: "pdf" }, testMeta()),
      "ACTIVATION_SECRETS_PURGED",
    );
    const rows = await getDb()
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.batchId, batch.id));
    expect(rows.every((row) => row.codeCiphertext === null && row.pinCiphertext === null)).toBe(
      true,
    );
  });
});

describe("redemption", () => {
  it("activates a valid card for a new student and grants lifetime access", async () => {
    const { card } = await soldCard();
    const email = "new.student@example.com";

    const check = await checkActivationCode({ code: card.code, meta: testMeta() });
    expect(check.requiresPin).toBe(true);

    const result = await redeem(card, email);
    expect(result.accountCreated).toBe(true);
    expect(result.token.length).toBeGreaterThanOrEqual(40);

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await hasCourseAccess(db, user!.id, courseId)).toBe(true);

    const [entitlement] = await db
      .select()
      .from(courseEntitlements)
      .where(eq(courseEntitlements.userId, user!.id));
    expect(entitlement?.expiresAt).toBeNull();
    expect(entitlement?.source).toBe("activation_code");

    const [code] = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.serial, card.serial));
    expect(code?.status).toBe("activated");
    expect(code?.activatedByUserId).toBe(user!.id);
    expect(code?.codeCiphertext).toBeNull();
    expect(code?.pinCiphertext).toBeNull();

    const session = await validateSessionToken(db, result.token);
    expect(session?.user.id).toBe(user!.id);

    const events = await db
      .select()
      .from(activationEvents)
      .where(eq(activationEvents.codeId, code!.id));
    expect(events.map((event) => event.type)).toContain("code_activated");
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "activation.code_redeemed"));
    expect(audits).toHaveLength(1);
    // Card secrets never reach the audit trail or event metadata.
    expect(JSON.stringify(audits)).not.toContain(card.code);
    expect(JSON.stringify(events)).not.toContain(card.code);
  });

  it("links the card to an existing account with the same e-mail (case-insensitive)", async () => {
    const existingId = await createUser("returning@example.com");
    const { card } = await soldCard();
    const result = await redeem(card, "Returning@Example.com".toLowerCase());
    expect(result.accountCreated).toBe(false);
    expect(result.userId).toBe(existingId);
    const all = await getDb().select().from(users).where(eq(users.email, "returning@example.com"));
    expect(all).toHaveLength(1);
  });

  it("rejects a card that was already used", async () => {
    const { card } = await soldCard();
    await redeem(card, "first@example.com");
    await expectAppError(
      checkActivationCode({ code: card.code, meta: testMeta() }),
      "ACTIVATION_CODE_ALREADY_USED",
    );
    await expectAppError(
      startActivation({
        code: card.code,
        pin: card.pin,
        email: "second@example.com",
        locale: "ar",
        meta: testMeta(),
      }),
      "ACTIVATION_CODE_ALREADY_USED",
    );
  });

  it("concurrent redemptions of one card by different people grant exactly one entitlement", async () => {
    const { card } = await soldCard();
    const emails = Array.from({ length: 6 }, (_, i) => `racer${i}@example.com`);
    const challenges = [];
    for (const email of emails) {
      const started = await startActivation({
        code: card.code,
        pin: card.pin,
        email,
        locale: "ar",
        meta: testMeta(),
      });
      challenges.push({ challengeId: started.challengeId, otp: mail.otpFor(email) });
    }

    const results = await Promise.allSettled(
      challenges.map((challenge) => completeActivation({ ...challenge, meta: testMeta() })),
    );
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(emails.length - 1);
    for (const failure of rejected)
      expect(failure.reason.code).toBe("ACTIVATION_CODE_ALREADY_USED");

    const db = getDb();
    const [code] = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.serial, card.serial));
    const grants = await db
      .select()
      .from(courseEntitlements)
      .where(eq(courseEntitlements.activationCodeId, code!.id));
    expect(grants).toHaveLength(1);
    // Losers did not get accounts created as a side effect.
    const accounts = await db.select().from(users);
    expect(accounts.filter((user) => emails.includes(user.email))).toHaveLength(1);
  });

  it("a newer activation challenge for the same e-mail invalidates the older one", async () => {
    const { batch, cards } = await newBatch({ quantity: 2 });
    await markCardsSold(admin, { serials: cards.map((card) => card.serial) }, testMeta());
    const email = "double@example.com";
    const first = await startActivation({
      code: cards[0]!.code,
      pin: cards[0]!.pin,
      email,
      locale: "ar",
      meta: testMeta(),
    });
    const otpA = mail.otpFor(email);
    const second = await startActivation({
      code: cards[1]!.code,
      pin: cards[1]!.pin,
      email,
      locale: "ar",
      meta: testMeta(),
    });
    const otpB = mail.otpFor(email);

    // Issuing the second challenge invalidated the first (only the latest code works).
    await expectAppError(
      completeActivation({ challengeId: first.challengeId, otp: otpA, meta: testMeta() }),
      "OTP_INVALID",
    );
    await completeActivation({ challengeId: second.challengeId, otp: otpB, meta: testMeta() });

    const db = getDb();
    const statuses = await db
      .select({ status: activationCodes.status })
      .from(activationCodes)
      .where(eq(activationCodes.batchId, batch.id));
    expect(statuses.map((row) => row.status).sort()).toEqual(["activated", "sold"]);
  });

  it("does not consume a second card when the account already has access", async () => {
    const { batch, cards } = await newBatch({ quantity: 2 });
    await markCardsSold(admin, { serials: cards.map((card) => card.serial) }, testMeta());
    await redeem(cards[0]!, "owner2@example.com");
    await expectAppError(redeem(cards[1]!, "owner2@example.com"), "ALREADY_ENTITLED");
    const [code] = await getDb()
      .select()
      .from(activationCodes)
      .where(
        and(eq(activationCodes.batchId, batch.id), eq(activationCodes.serial, cards[1]!.serial)),
      );
    expect(code?.status).toBe("sold");
  });

  it("rejects revoked cards", async () => {
    const { card } = await soldCard();
    const [row] = await getDb()
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.serial, card.serial));
    await revokeCard(admin, { codeId: row!.id, reason: "reported stolen" }, testMeta());
    await expectAppError(
      checkActivationCode({ code: card.code, meta: testMeta() }),
      "ACTIVATION_CODE_REVOKED",
    );
  });

  it("rejects unsold cards when the batch requires a point-of-sale activation", async () => {
    const { cards } = await newBatch({ quantity: 1, requiresSale: true });
    await expectAppError(
      checkActivationCode({ code: cards[0]!.code, meta: testMeta() }),
      "ACTIVATION_CODE_NOT_SOLD",
    );
  });

  it("allows unsold cards when the batch does not require a sale", async () => {
    const { cards } = await newBatch({ quantity: 1, requiresSale: false, requiresPin: false });
    const result = await redeem(cards[0]!, "nosale@example.com");
    expect(result.accountCreated).toBe(true);
  });

  it("requires the scratch-off PIN and locks the card after repeated failures", async () => {
    const { card } = await soldCard();
    const base = { code: card.code, email: "pin@example.com", locale: "ar" as const };
    await expectAppError(
      startActivation({ ...base, pin: null, meta: testMeta() }),
      "ACTIVATION_PIN_REQUIRED",
    );

    const wrongPin = card.pin === "00000000" ? "11111111" : "00000000";
    for (let attempt = 1; attempt < MAX_FAILED_PIN_ATTEMPTS; attempt += 1) {
      await expectAppError(
        startActivation({ ...base, pin: wrongPin, meta: testMeta() }),
        "ACTIVATION_PIN_INVALID",
      );
    }
    await expectAppError(
      startActivation({ ...base, pin: wrongPin, meta: testMeta() }),
      "ACTIVATION_CODE_LOCKED",
    );
    // Even the right PIN is refused while locked.
    await expectAppError(
      startActivation({ ...base, pin: card.pin, meta: testMeta() }),
      "ACTIVATION_CODE_LOCKED",
    );

    const [row] = await getDb()
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.serial, card.serial));
    expect(row?.lockedAt).toBeInstanceOf(Date);
    await unlockCard(admin, row!.id, testMeta());
    const started = await startActivation({ ...base, pin: card.pin, meta: testMeta() });
    expect(started.challengeId).toBeTruthy();
  });

  it("accepts codes typed with separators, lowercase and look-alike letters", async () => {
    const { card } = await soldCard();
    const typed = card.code
      .toLowerCase()
      .replace(/(.{4})(?!$)/g, "$1-")
      .replace(/0/g, "o")
      .replace(/1/g, "l");
    const check = await checkActivationCode({ code: typed, meta: testMeta() });
    expect(check.requiresPin).toBe(true);
  });

  it("rejects malformed and unknown codes without revealing anything", async () => {
    await expectAppError(
      checkActivationCode({ code: "not-a-code", meta: testMeta() }),
      "ACTIVATION_CODE_INVALID",
    );
    await expectAppError(
      checkActivationCode({ code: "ZZZZ-ZZZZ-ZZZZ-ZZZZ", meta: testMeta() }),
      "ACTIVATION_CODE_INVALID",
    );
  });

  it("rolls back everything when a failure happens mid-activation", async () => {
    const { card } = await soldCard();
    const email = "crash@example.com";
    const started = await startActivation({
      code: card.code,
      pin: card.pin,
      email,
      locale: "ar",
      meta: testMeta(),
    });
    const otp = mail.otpFor(email);

    await expect(
      completeActivation(
        { challengeId: started.challengeId, otp, meta: testMeta() },
        {
          beforeCommit: async () => {
            throw new Error("simulated crash before commit");
          },
        },
      ),
    ).rejects.toThrow("simulated crash");

    const db = getDb();
    const [code] = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.serial, card.serial));
    expect(code?.status).toBe("sold");
    expect(code?.codeCiphertext).not.toBeNull();
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
    expect(await db.select().from(courseEntitlements)).toHaveLength(0);
    const [challenge] = await db
      .select()
      .from(authOtpChallenges)
      .where(eq(authOtpChallenges.id, started.challengeId));
    expect(challenge?.consumedAt).toBeNull();
    // The same OTP still works afterwards: the failed attempt left no partial state.
    const result = await completeActivation({
      challengeId: started.challengeId,
      otp,
      meta: testMeta(),
    });
    expect(result.accountCreated).toBe(true);
  });

  it("issues a replacement that works while the original stops working", async () => {
    const { card } = await soldCard();
    const [row] = await getDb()
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.serial, card.serial));
    const replacement = await replaceCard(
      admin,
      { codeId: row!.id, reason: "damaged" },
      testMeta(),
    );
    expect(replacement.serial).toMatch(/-10001$/);
    await expectAppError(
      checkActivationCode({ code: card.code, meta: testMeta() }),
      "ACTIVATION_CODE_REVOKED",
    );
    const result = await redeem(replacement, "replacement@example.com");
    expect(result.accountCreated).toBe(true);
  });
});

describe("returning students", () => {
  it("sign in again with e-mail OTP only (no QR code needed)", async () => {
    const { card } = await soldCard();
    const email = "returning.student@example.com";
    await redeem(card, email);

    const { challengeId } = await requestLoginCode({ email, locale: "ar", meta: testMeta() });
    const login = await completeLogin({ challengeId, code: mail.otpFor(email), meta: testMeta() });
    expect(login.isStaff).toBe(false);
    const db = getDb();
    const session = await validateSessionToken(db, login.token);
    expect(session).not.toBeNull();
    expect(await hasCourseAccess(db, login.userId, courseId)).toBe(true);
    const sessions = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, login.userId));
    expect(sessions).toHaveLength(2);
  });

  it("a signed-in account without an entitlement has no course access", async () => {
    const userId = await createUser("no-access@example.com");
    expect(await hasCourseAccess(getDb(), userId, courseId)).toBe(false);
  });
});
