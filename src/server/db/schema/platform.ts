import { sql } from "drizzle-orm";
import { index, inet, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { INTEGRATION_EVENT_STATUSES } from "../../../shared/enums";
import { createdAt, enumCheck, pk, tstz } from "./_columns";
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

/**
 * Inbound messages from external systems (landing-site orders, delivery
 * webhooks and imports): what arrived and what we did with it. Contains
 * customer data: purged after 90 days by the maintenance job.
 */
export const integrationEvents = pgTable(
  "integration_events",
  {
    id: pk(),
    /** "landing_site", "delivery_webhook", "delivery_import"… */
    source: text().notNull(),
    /** The sender's id for the message, when it has one (deduplication). */
    externalId: text(),
    status: text({ enum: INTEGRATION_EVENT_STATUSES }).notNull(),
    error: text(),
    payload: jsonb().$type<unknown>().notNull(),
    receivedAt: createdAt(),
  },
  (t) => [
    enumCheck("integration_events_status_check", t.status, INTEGRATION_EVENT_STATUSES),
    uniqueIndex("integration_events_source_external_key")
      .on(t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
    index("integration_events_source_received_idx").on(t.source, t.receivedAt),
  ],
);
