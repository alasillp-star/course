import "server-only";
import { auditLogs } from "@/server/db/schema";
import type { Executor } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/request-meta";
import { redact } from "@/server/logger";

export type AuditAction =
  // Authentication
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "auth.session_revoked"
  | "auth.sessions_revoked_all"
  | "auth.mfa_enrolled"
  | "auth.mfa_verified"
  | "auth.mfa_failed"
  | "auth.mfa_recovery_code_used"
  | "auth.mfa_reset"
  | "auth.email_changed"
  // Users & RBAC
  | "user.created"
  | "user.suspended"
  | "user.reactivated"
  | "rbac.role_granted"
  | "rbac.role_revoked"
  // Activation cards
  | "activation.batch_created"
  | "activation.batch_exported"
  | "activation.batch_secrets_purged"
  | "activation.code_sold"
  | "activation.code_unsold"
  | "activation.code_revoked"
  | "activation.code_replaced"
  | "activation.code_unlocked"
  | "activation.code_redeemed"
  // Entitlements
  | "entitlement.granted"
  | "entitlement.revoked"
  // Course content
  | "content.module_created"
  | "content.module_updated"
  | "content.module_deleted"
  | "content.modules_reordered"
  | "content.lesson_created"
  | "content.lesson_updated"
  | "content.lesson_deleted"
  | "content.lessons_reordered"
  | "content.publication_changed"
  | "content.resource_added"
  | "content.resource_updated"
  | "content.resource_deleted"
  // Media
  | "media.upload_started"
  | "media.ready"
  | "media.failed"
  | "media.video_detached";

export type AuditEntry = {
  action: AuditAction;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: RequestMeta;
  metadata?: Record<string, unknown>;
};

/**
 * Appends to the immutable audit trail. Pass the transaction executor when the
 * audited change happens in a transaction so the log commits (or rolls back)
 * together with it. Metadata is redacted as defence in depth.
 */
export async function recordAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    actorType: entry.actorUserId ? "user" : "system",
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ipAddress: entry.meta?.ip ?? null,
    userAgent: entry.meta?.userAgent ?? null,
    requestId: entry.meta?.requestId ?? null,
    metadata: (redact(entry.metadata ?? {}) as Record<string, unknown>) ?? {},
  });
}
