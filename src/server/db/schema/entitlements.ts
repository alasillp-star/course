import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ENTITLEMENT_SOURCES, ENTITLEMENT_STATUSES } from "../../../shared/enums";
import { createdAt, enumCheck, pk, rule, tstz, updatedAt } from "./_columns";
import { activationCodes } from "./activation";
import { courses } from "./catalog";
import { orders } from "./commerce";
import { users } from "./identity";

/**
 * Course access grants, deliberately separate from authentication and roles:
 * being logged in never implies access to paid content. Every grant records
 * its source (activation card, order, manual grant, future subscription), and
 * `expires_at IS NULL` means lifetime access.
 */
export const courseEntitlements = pgTable(
  "course_entitlements",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    status: text({ enum: ENTITLEMENT_STATUSES }).notNull().default("active"),
    source: text({ enum: ENTITLEMENT_SOURCES }).notNull(),
    activationCodeId: uuid().references(() => activationCodes.id, { onDelete: "restrict" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    grantedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    startsAt: tstz().notNull().defaultNow(),
    expiresAt: tstz(),
    revokedAt: tstz(),
    revokedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    revokeReason: text(),
    note: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck("course_entitlements_status_check", t.status, ENTITLEMENT_STATUSES),
    enumCheck("course_entitlements_source_check", t.source, ENTITLEMENT_SOURCES),
    // At most one active grant per (user, course).
    uniqueIndex("course_entitlements_active_key")
      .on(t.userId, t.courseId)
      .where(sql`${t.status} = 'active'`),
    // A card can never back more than one grant, whatever its status.
    uniqueIndex("course_entitlements_activation_code_key")
      .on(t.activationCodeId)
      .where(sql`${t.activationCodeId} is not null`),
    rule(
      "course_entitlements_source_ref_check",
      sql`${t.source} <> 'activation_code' or ${t.activationCodeId} is not null`,
    ),
    rule(
      "course_entitlements_revoked_check",
      sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null)`,
    ),
    rule(
      "course_entitlements_period_check",
      sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.startsAt}`,
    ),
    index("course_entitlements_course_idx").on(t.courseId, t.status),
  ],
);
