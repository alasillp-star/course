import "server-only";
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  activationCodes,
  courseEntitlements,
  courseProgress,
  courses,
  profiles,
  roles,
  userRoles,
  users,
} from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import type { UserStatus } from "@/shared/enums";
import { recordAudit } from "../audit/audit.service";
import { assertCan, can, type Actor } from "../access/actor";
import {
  activeEntitlementCondition,
  listUserEntitlements,
} from "../entitlements/entitlements.service";
import { listActiveSessions, revokeAllSessions } from "./session.service";

export type StudentListFilters = {
  search?: string;
  status?: UserStatus;
  access?: "with" | "without";
  limit?: number;
  offset?: number;
};

/** Student directory for support/admin (PII limited to what `users.read` allows). */
export async function listStudents(actor: Actor, filters: StudentListFilters) {
  assertCan(actor, "users.read");
  const db = getDb();
  const conditions: SQL[] = [
    inArray(
      users.id,
      db
        .select({ id: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(roles.key, "student")),
    ),
  ];
  if (filters.status) conditions.push(eq(users.status, filters.status));
  if (filters.search) {
    const term = `%${filters.search.trim().toLowerCase().replace(/[%_]/g, "")}%`;
    conditions.push(
      sql`(${users.email} like ${term} or lower(coalesce(${profiles.displayName}, '')) like ${term})`,
    );
  }
  const hasAccess = sql`exists (select 1 from ${courseEntitlements} where ${courseEntitlements.userId} = ${users.id} and ${activeEntitlementCondition()})`;
  if (filters.access === "with") conditions.push(hasAccess);
  if (filters.access === "without") conditions.push(sql`not ${hasAccess}`);
  const where = and(...conditions);
  const limit = Math.min(filters.limit ?? 50, 200);

  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
        displayName: profiles.displayName,
        createdAt: users.createdAt,
        lastSeenAt: users.lastSeenAt,
        hasAccess: sql<boolean>`${hasAccess}`,
        progress: sql<
          number | null
        >`(select max(${courseProgress.percentComplete}) from ${courseProgress} where ${courseProgress.userId} = ${users.id})`,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(filters.offset ?? 0),
    db
      .select({ total: count() })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(where),
  ]);
  return { items, total: Number(total) };
}

export async function getStudentDetail(actor: Actor, userId: string) {
  assertCan(actor, "users.read");
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      locale: users.locale,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      lastSeenAt: users.lastSeenAt,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
      displayName: profiles.displayName,
      fullName: profiles.fullName,
      phone: profiles.phone,
      city: profiles.city,
      country: profiles.country,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!user) throw new AppError("NOT_FOUND");

  const sensitive = can(actor, "users.read_sensitive");
  const [entitlements, sessions, cards, roleRows, progress] = await Promise.all([
    can(actor, "entitlements.read") ? listUserEntitlements(db, userId) : Promise.resolve(null),
    can(actor, "users.sessions.manage") ? listActiveSessions(db, userId) : Promise.resolve(null),
    can(actor, "activation.codes.read")
      ? db
          .select({
            id: activationCodes.id,
            serial: activationCodes.serial,
            activatedAt: activationCodes.activatedAt,
          })
          .from(activationCodes)
          .where(eq(activationCodes.activatedByUserId, userId))
      : Promise.resolve(null),
    db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId)),
    can(actor, "progress.read")
      ? db
          .select({
            courseId: courseProgress.courseId,
            courseTitle: courses.title,
            percentComplete: courseProgress.percentComplete,
            completedLessons: courseProgress.completedLessons,
            totalLessons: courseProgress.totalLessons,
            lastActivityAt: courseProgress.lastActivityAt,
          })
          .from(courseProgress)
          .innerJoin(courses, eq(courses.id, courseProgress.courseId))
          .where(eq(courseProgress.userId, userId))
      : Promise.resolve(null),
  ]);

  return {
    ...user,
    phone: sensitive ? user.phone : user.phone ? "•••" : null,
    roles: roleRows.map((row) => row.key),
    entitlements,
    sessions:
      sessions?.map((session) => ({
        ...session,
        ipAddress: sensitive ? session.ipAddress : null,
      })) ?? null,
    cards,
    progress,
  };
}

export async function suspendUser(
  actor: Actor,
  params: { userId: string; reason: string },
  meta: RequestMeta,
) {
  assertCan(actor, "users.suspend");
  if (params.userId === actor.userId) throw new AppError("FORBIDDEN", "Cannot suspend yourself");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, params.userId)).for("update");
    if (!target || target.status === "deleted") throw new AppError("NOT_FOUND");
    if (target.status === "suspended") throw new AppError("INVALID_STATE");
    const targetRoles = await tx
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, params.userId));
    if (targetRoles.some((role) => role.key === "super_admin")) assertCan(actor, "roles.manage");

    await tx
      .update(users)
      .set({
        status: "suspended",
        suspendedAt: new Date(),
        suspendedReason: params.reason,
        suspendedBy: actor.userId,
      })
      .where(eq(users.id, params.userId));
    await revokeAllSessions(tx, { userId: params.userId, reason: "account_suspended" });
    await recordAudit(tx, {
      action: "user.suspended",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: params.userId,
      meta,
      metadata: { reason: params.reason },
    });
  });
}

export async function reactivateUser(actor: Actor, userId: string, meta: RequestMeta) {
  assertCan(actor, "users.suspend");
  const db = getDb();
  const updated = await db
    .update(users)
    .set({ status: "active", suspendedAt: null, suspendedReason: null, suspendedBy: null })
    .where(and(eq(users.id, userId), eq(users.status, "suspended")))
    .returning({ id: users.id });
  if (updated.length === 0) throw new AppError("INVALID_STATE");
  await recordAudit(db, {
    action: "user.reactivated",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
    meta,
  });
}

export async function revokeUserSessions(
  actor: Actor,
  userId: string,
  meta: RequestMeta,
): Promise<number> {
  assertCan(actor, "users.sessions.manage");
  const db = getDb();
  const revoked = await revokeAllSessions(db, { userId, reason: "revoked_by_staff" });
  await recordAudit(db, {
    action: "auth.sessions_revoked_all",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: userId,
    meta,
    metadata: { count: revoked },
  });
  return revoked;
}

/** Resolves a user id by e-mail for staff tools (role assignment, grants). */
export async function findUserIdByEmail(actor: Actor, email: string): Promise<string | null> {
  assertCan(actor, "users.read");
  const [row] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email));
  return row?.id ?? null;
}

/**
 * Staff onboarding: returns the account for `email`, creating it when needed.
 * The account is created WITHOUT a verified e-mail and can only be used after
 * its owner signs in with an e-mailed OTP (and then enrols MFA).
 */
export async function ensureStaffAccount(
  actor: Actor,
  email: string,
  meta: RequestMeta,
): Promise<string> {
  assertCan(actor, "staff.manage");
  const db = getDb();
  const [existing] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, email));
  if (existing) {
    if (existing.status === "deleted") throw new AppError("NOT_FOUND");
    return existing.id;
  }
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email, emailVerifiedAt: null })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!created) {
      const [winner] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!winner) throw new Error("account vanished");
      return winner.id;
    }
    await tx.insert(profiles).values({ userId: created.id });
    await recordAudit(tx, {
      action: "user.created",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: created.id,
      meta,
      metadata: { via: "staff_invitation" },
    });
    return created.id;
  });
}
