import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  MFA_FACTOR_TYPES,
  OTP_PURPOSES,
  SESSION_CLIENT_TYPES,
  USER_STATUSES,
} from "../../../shared/enums";
import { LOCALES } from "../../../i18n/config";
import { createdAt, enumCheck, pk, rule, tstz, updatedAt } from "./_columns";
import { activationCodes } from "./activation";

/**
 * Accounts. A row is only ever created after the e-mail address has been
 * proven with an OTP (activation or first login of a bootstrapped staff
 * account), so there are no "pending" accounts. Users are never hard-deleted:
 * deletion anonymises the row (status = 'deleted') to keep orders, audit logs
 * and community threads referentially intact.
 */
export const users = pgTable(
  "users",
  {
    id: pk(),
    /** Normalised (trimmed, lower-cased) address; unique across the platform. */
    email: text().notNull(),
    emailVerifiedAt: tstz(),
    status: text({ enum: USER_STATUSES }).notNull().default("active"),
    locale: text({ enum: LOCALES }).notNull().default("ar"),
    lastLoginAt: tstz(),
    lastSeenAt: tstz(),
    suspendedAt: tstz(),
    suspendedReason: text(),
    suspendedBy: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    deletedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    enumCheck("users_status_check", t.status, USER_STATUSES),
    enumCheck("users_locale_check", t.locale, LOCALES),
    rule("users_email_normalized_check", sql`${t.email} = lower(btrim(${t.email}))`),
    rule(
      "users_suspension_consistency_check",
      sql`(${t.status} = 'suspended') = (${t.suspendedAt} is not null)`,
    ),
    index("users_created_at_idx").on(t.createdAt),
    index("users_last_seen_at_idx").on(t.lastSeenAt),
  ],
);

export const profiles = pgTable("profiles", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Public name shown in the community. */
  displayName: text(),
  /** Legal name printed on certificates. */
  fullName: text(),
  phone: text(),
  country: text(),
  city: text(),
  bio: text(),
  avatarUrl: text(),
  timezone: text().notNull().default("Africa/Algiers"),
  marketingOptIn: boolean().notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** History of e-mail changes (self-service or support-assisted recovery). */
export const userEmailChanges = pgTable(
  "user_email_changes",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    oldEmail: text().notNull(),
    newEmail: text().notNull(),
    changedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [index("user_email_changes_user_idx").on(t.userId, t.createdAt)],
);

/**
 * One-time passcodes sent by e-mail. Only an HMAC of the code is stored.
 * A challenge is single-use, short-lived and allows a bounded number of
 * verification attempts.
 */
export const authOtpChallenges = pgTable(
  "auth_otp_challenges",
  {
    id: pk(),
    purpose: text({ enum: OTP_PURPOSES }).notNull(),
    email: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text().notNull(),
    attempts: smallint().notNull().default(0),
    maxAttempts: smallint().notNull().default(5),
    expiresAt: tstz().notNull(),
    consumedAt: tstz(),
    invalidatedAt: tstz(),
    /** Set for purpose = 'activation': the card being redeemed. */
    activationCodeId: uuid().references(() => activationCodes.id, { onDelete: "cascade" }),
    /** Non-secret context (e.g. the new address for an e-mail change). */
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: inet(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("auth_otp_challenges_purpose_check", t.purpose, OTP_PURPOSES),
    rule(
      "auth_otp_challenges_attempts_check",
      sql`${t.attempts} >= 0 and ${t.attempts} <= ${t.maxAttempts}`,
    ),
    rule(
      "auth_otp_challenges_activation_check",
      sql`(${t.purpose} = 'activation') = (${t.activationCodeId} is not null)`,
    ),
    index("auth_otp_challenges_email_idx").on(t.email, t.purpose, t.createdAt),
    index("auth_otp_challenges_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Server-side sessions. The browser holds a random 256-bit token; only its
 * SHA-256 digest is stored, so a database leak does not yield usable sessions.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: pk(),
    tokenHash: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientType: text({ enum: SESSION_CLIENT_TYPES }).notNull().default("web"),
    /** When the user proved control of the e-mail address for this session. */
    authenticatedAt: tstz().notNull().defaultNow(),
    /** Set once a staff member completes the second factor for this session. */
    mfaVerifiedAt: tstz(),
    lastSeenAt: tstz().notNull().defaultNow(),
    expiresAt: tstz().notNull(),
    revokedAt: tstz(),
    revokedReason: text(),
    ipAddress: inet(),
    userAgent: text(),
    deviceLabel: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("auth_sessions_token_hash_key").on(t.tokenHash),
    enumCheck("auth_sessions_client_type_check", t.clientType, SESSION_CLIENT_TYPES),
    index("auth_sessions_user_active_idx")
      .on(t.userId, t.lastSeenAt)
      .where(sql`${t.revokedAt} is null`),
    index("auth_sessions_expires_idx").on(t.expiresAt),
  ],
);

/** Second factors for staff accounts. The TOTP secret is encrypted at rest. */
export const authMfaFactors = pgTable(
  "auth_mfa_factors",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text({ enum: MFA_FACTOR_TYPES }).notNull().default("totp"),
    secretCiphertext: text().notNull(),
    confirmedAt: tstz(),
    /** Last accepted TOTP time-step, to reject replays of the same code. */
    lastUsedStep: bigint({ mode: "number" }),
    disabledAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("auth_mfa_factors_type_check", t.type, MFA_FACTOR_TYPES),
    uniqueIndex("auth_mfa_factors_one_active_key")
      .on(t.userId, t.type)
      .where(sql`${t.disabledAt} is null`),
  ],
);

/** Single-use MFA recovery codes (HMAC only). */
export const authRecoveryCodes = pgTable(
  "auth_recovery_codes",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text().notNull(),
    usedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("auth_recovery_codes_hash_key").on(t.codeHash),
    index("auth_recovery_codes_user_idx").on(t.userId),
  ],
);

/** Fixed-window counters for rate limiting (used when Redis is not configured). */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text().primaryKey(),
    count: integer().notNull().default(0),
    windowStartedAt: tstz().notNull(),
    resetAt: tstz().notNull(),
  },
  (t) => [index("rate_limit_buckets_reset_idx").on(t.resetAt)],
);

/** Accepted legal documents (terms, privacy) and marketing consent history. */
export const consents = pgTable(
  "consents",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    version: text().notNull(),
    grantedAt: tstz().notNull().defaultNow(),
    revokedAt: tstz(),
    ipAddress: inet(),
  },
  (t) => [
    enumCheck("consents_kind_check", t.kind, ["terms", "privacy", "marketing"]),
    index("consents_user_idx").on(t.userId, t.kind),
  ],
);

/** GDPR-style export and deletion requests. */
export const dataRequests = pgTable(
  "data_requests",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    status: text().notNull().default("pending"),
    requestedAt: tstz().notNull().defaultNow(),
    completedAt: tstz(),
    handledBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resultStorageKey: text(),
    notes: text(),
  },
  (t) => [
    enumCheck("data_requests_kind_check", t.kind, ["export", "deletion"]),
    enumCheck("data_requests_status_check", t.status, [
      "pending",
      "processing",
      "completed",
      "rejected",
    ]),
    index("data_requests_user_idx").on(t.userId),
  ],
);
