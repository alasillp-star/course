import { index, inet, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { enumCheck, pk, tstz } from "./_columns";
import { users } from "./identity";

/** Runtime-editable platform configuration (branding, policies, limits). */
export const platformSettings = pgTable("platform_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  updatedAt: tstz().notNull().defaultNow(),
});

/**
 * Append-only audit trail of security-relevant and administrative actions.
 * UPDATE and DELETE are blocked by a trigger (see the hardening migration);
 * metadata never contains secrets such as activation codes, PINs or OTPs.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    occurredAt: tstz().notNull().defaultNow(),
    actorUserId: uuid().references(() => users.id),
    actorType: text().notNull().default("user"),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    ipAddress: inet(),
    userAgent: text(),
    requestId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    enumCheck("audit_logs_actor_type_check", t.actorType, ["user", "system"]),
    index("audit_logs_occurred_idx").on(t.occurredAt),
    index("audit_logs_actor_idx").on(t.actorUserId, t.occurredAt),
    index("audit_logs_action_idx").on(t.action, t.occurredAt),
    index("audit_logs_target_idx").on(t.targetType, t.targetId, t.occurredAt),
  ],
);
