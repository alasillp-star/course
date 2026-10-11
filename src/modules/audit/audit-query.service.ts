import "server-only";
import { and, count, desc, eq, gte, like, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { auditLogs, users } from "@/server/db/schema";
import { assertCan, type Actor } from "../access/actor";

export type AuditFilters = {
  action?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export async function queryAuditLog(actor: Actor, filters: AuditFilters) {
  assertCan(actor, "audit.read");
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.action) conditions.push(like(auditLogs.action, `${filters.action.replace(/[%_]/g, "")}%`));
  if (filters.actorEmail) conditions.push(eq(users.email, filters.actorEmail.trim().toLowerCase()));
  if (filters.targetType) conditions.push(eq(auditLogs.targetType, filters.targetType));
  if (filters.targetId) conditions.push(eq(auditLogs.targetId, filters.targetId));
  if (filters.from) conditions.push(gte(auditLogs.occurredAt, filters.from));
  if (filters.to) conditions.push(lte(auditLogs.occurredAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;
  const limit = Math.min(filters.limit ?? 50, 200);

  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        occurredAt: auditLogs.occurredAt,
        action: auditLogs.action,
        actorEmail: users.email,
        actorType: auditLogs.actorType,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        ipAddress: auditLogs.ipAddress,
        requestId: auditLogs.requestId,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.occurredAt))
      .limit(limit)
      .offset(filters.offset ?? 0),
    db.select({ total: count() }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId)).where(where),
  ]);
  return { items, total: Number(total) };
}
