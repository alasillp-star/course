import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  ACTIVATION_BATCH_STATUSES,
  ACTIVATION_CODE_STATUSES,
  ACTIVATION_EVENT_TYPES,
} from "../../../shared/enums";
import { createdAt, enumCheck, pk, rule, tstz, updatedAt } from "./_columns";
import { courses, mediaAssets } from "./catalog";
import { orderItems, orders } from "./commerce";
import { users } from "./identity";

/** Print layout for activation cards (background artwork + element positions). */
export const cardTemplates = pgTable("card_templates", {
  id: pk(),
  name: text().notNull(),
  isDefault: boolean().notNull().default(false),
  backgroundAssetId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
  /** Element positions in millimetres, see src/modules/activation/card-layout.ts. */
  layout: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A print run of activation cards. Raw card secrets are encrypted (not hashed)
 * only until the batch is finalised after printing; `secrets_purged_at` marks
 * the point after which the platform can no longer reproduce any card secret.
 */
export const activationBatches = pgTable(
  "activation_batches",
  {
    id: pk(),
    /** Human-friendly sequential number (B-0007). */
    batchNumber: serial().notNull(),
    /** Prefix of every card serial in this batch, e.g. "B0007". */
    serialPrefix: text().notNull(),
    name: text().notNull(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    quantity: integer().notNull(),
    /** Card carries a scratch-off PIN that must be entered with the QR code. */
    requiresPin: boolean().notNull().default(true),
    /** Point-of-sale activation: cards cannot be redeemed until marked sold. */
    requiresSale: boolean().notNull().default(true),
    /** Optional deadline for redeeming unused cards. */
    redeemBy: tstz(),
    status: text({ enum: ACTIVATION_BATCH_STATUSES }).notNull().default("active"),
    cardTemplateId: uuid().references(() => cardTemplates.id, { onDelete: "set null" }),
    notes: text(),
    exportCount: integer().notNull().default(0),
    lastExportedAt: tstz(),
    secretsPurgedAt: tstz(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("activation_batches_number_key").on(t.batchNumber),
    uniqueIndex("activation_batches_serial_prefix_key").on(t.serialPrefix),
    enumCheck("activation_batches_status_check", t.status, ACTIVATION_BATCH_STATUSES),
    rule("activation_batches_quantity_check", sql`${t.quantity} between 1 and 10000`),
    index("activation_batches_course_idx").on(t.courseId, t.createdAt),
  ],
);

/**
 * Individual activation cards.
 *
 * Secrets: the QR token (`code_hash`) and the scratch-off PIN (`pin_hash`) are
 * stored as keyed HMAC-SHA256 digests; lookups use the digest. The encrypted
 * copies exist only to print the cards and are wiped on activation, revocation
 * or batch finalisation.
 *
 * Integrity: one card can be activated exactly once. Redemption locks the row
 * (SELECT ... FOR UPDATE) and the CHECK constraints below plus the unique index
 * on course_entitlements.activation_code_id make a double grant impossible even
 * under concurrent requests.
 */
export const activationCodes = pgTable(
  "activation_codes",
  {
    id: pk(),
    batchId: uuid()
      .notNull()
      .references(() => activationBatches.id, { onDelete: "restrict" }),
    sequence: integer().notNull(),
    /** Printed, non-secret card number used by sales and support (B0007-00042). */
    serial: text().notNull(),
    codeHash: text().notNull(),
    codeCiphertext: text(),
    pinHash: text(),
    pinCiphertext: text(),
    status: text({ enum: ACTIVATION_CODE_STATUSES }).notNull().default("available"),
    failedPinAttempts: smallint().notNull().default(0),
    lockedAt: tstz(),
    soldAt: tstz(),
    soldBy: uuid().references(() => users.id, { onDelete: "set null" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    orderItemId: uuid().references(() => orderItems.id, { onDelete: "set null" }),
    activatedAt: tstz(),
    activatedByUserId: uuid().references(() => users.id, { onDelete: "restrict" }),
    revokedAt: tstz(),
    revokedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    revokeReason: text(),
    /** When this card was issued to replace a lost/damaged one. */
    replacesCodeId: uuid().references((): AnyPgColumn => activationCodes.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("activation_codes_code_hash_key").on(t.codeHash),
    uniqueIndex("activation_codes_serial_key").on(t.serial),
    uniqueIndex("activation_codes_batch_sequence_key").on(t.batchId, t.sequence),
    uniqueIndex("activation_codes_replaces_key")
      .on(t.replacesCodeId)
      .where(sql`${t.replacesCodeId} is not null`),
    enumCheck("activation_codes_status_check", t.status, ACTIVATION_CODE_STATUSES),
    rule(
      "activation_codes_activated_check",
      sql`(${t.status} = 'activated') = (${t.activatedAt} is not null and ${t.activatedByUserId} is not null)`,
    ),
    rule(
      "activation_codes_revoked_check",
      sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null)`,
    ),
    rule("activation_codes_sold_check", sql`${t.status} <> 'sold' or ${t.soldAt} is not null`),
    rule(
      "activation_codes_consumed_secrets_check",
      sql`${t.status} not in ('activated', 'revoked') or (${t.codeCiphertext} is null and ${t.pinCiphertext} is null)`,
    ),
    rule("activation_codes_pin_attempts_check", sql`${t.failedPinAttempts} >= 0`),
    index("activation_codes_batch_status_idx").on(t.batchId, t.status),
    index("activation_codes_activated_by_idx").on(t.activatedByUserId),
    index("activation_codes_order_idx").on(t.orderId),
  ],
);

/** Append-only lifecycle log of cards and batches (never contains secrets). */
export const activationEvents = pgTable(
  "activation_events",
  {
    id: pk(),
    type: text({ enum: ACTIVATION_EVENT_TYPES }).notNull(),
    batchId: uuid()
      .notNull()
      .references(() => activationBatches.id),
    codeId: uuid().references(() => activationCodes.id),
    actorUserId: uuid().references(() => users.id),
    ipAddress: inet(),
    userAgent: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    enumCheck("activation_events_type_check", t.type, ACTIVATION_EVENT_TYPES),
    index("activation_events_code_idx").on(t.codeId, t.occurredAt),
    index("activation_events_batch_idx").on(t.batchId, t.occurredAt),
    index("activation_events_type_idx").on(t.type, t.occurredAt),
  ],
);
