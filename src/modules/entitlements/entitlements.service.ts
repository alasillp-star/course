import "server-only";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { courseEntitlements, courses } from "@/server/db/schema";
import { AppError, isUniqueViolation } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { recordAudit } from "../audit/audit.service";
import { assertCan, type Actor } from "../access/actor";

export type Entitlement = typeof courseEntitlements.$inferSelect;

/** SQL predicate: entitlement is active right now. */
export function activeEntitlementCondition() {
  return and(
    eq(courseEntitlements.status, "active"),
    lte(courseEntitlements.startsAt, sql`now()`),
    or(isNull(courseEntitlements.expiresAt), gt(courseEntitlements.expiresAt, sql`now()`)),
  );
}

/**
 * The single authorisation check for paid course content (lessons, videos,
 * resources, community). Independent of roles and of how the user signed in.
 */
export async function hasCourseAccess(executor: Executor, userId: string, courseId: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: courseEntitlements.id })
    .from(courseEntitlements)
    .where(
      and(
        eq(courseEntitlements.userId, userId),
        eq(courseEntitlements.courseId, courseId),
        activeEntitlementCondition(),
      ),
    )
    .limit(1);
  return !!row;
}

export async function findActiveEntitlement(executor: Executor, userId: string, courseId: string) {
  const [row] = await executor
    .select()
    .from(courseEntitlements)
    .where(
      and(
        eq(courseEntitlements.userId, userId),
        eq(courseEntitlements.courseId, courseId),
        eq(courseEntitlements.status, "active"),
      ),
    )
    .limit(1);
  return row;
}

export async function listUserEntitlements(executor: Executor, userId: string) {
  return executor
    .select({
      id: courseEntitlements.id,
      status: courseEntitlements.status,
      source: courseEntitlements.source,
      startsAt: courseEntitlements.startsAt,
      expiresAt: courseEntitlements.expiresAt,
      revokedAt: courseEntitlements.revokedAt,
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: courses.title,
    })
    .from(courseEntitlements)
    .innerJoin(courses, eq(courses.id, courseEntitlements.courseId))
    .where(eq(courseEntitlements.userId, userId))
    .orderBy(courseEntitlements.createdAt);
}

/**
 * Grants lifetime access from a redeemed card. Runs inside the redemption
 * transaction; the partial unique indexes turn any concurrent double grant
 * into a constraint violation, mapped to a domain error here.
 */
export async function grantFromActivationCode(
  executor: Executor,
  params: { userId: string; courseId: string; activationCodeId: string },
): Promise<Entitlement> {
  try {
    const [entitlement] = await executor
      .insert(courseEntitlements)
      .values({
        userId: params.userId,
        courseId: params.courseId,
        source: "activation_code",
        activationCodeId: params.activationCodeId,
        expiresAt: null,
      })
      .returning();
    if (!entitlement) throw new Error("Failed to create entitlement");
    return entitlement;
  } catch (error) {
    if (isUniqueViolation(error, "course_entitlements_active_key")) throw new AppError("ALREADY_ENTITLED");
    if (isUniqueViolation(error, "course_entitlements_activation_code_key")) {
      throw new AppError("ACTIVATION_CODE_ALREADY_USED");
    }
    throw error;
  }
}

/** Manual grant by staff (gift, correction, partner access). */
export async function grantManually(
  executor: Executor,
  actor: Actor,
  params: { userId: string; courseId: string; expiresAt?: Date | null; note: string },
  meta: RequestMeta,
): Promise<Entitlement> {
  assertCan(actor, "entitlements.grant");
  try {
    const [entitlement] = await executor
      .insert(courseEntitlements)
      .values({
        userId: params.userId,
        courseId: params.courseId,
        source: "manual_grant",
        grantedBy: actor.userId,
        expiresAt: params.expiresAt ?? null,
        note: params.note,
      })
      .returning();
    if (!entitlement) throw new Error("Failed to create entitlement");
    await recordAudit(executor, {
      action: "entitlement.granted",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: params.userId,
      meta,
      metadata: { entitlementId: entitlement.id, courseId: params.courseId, source: "manual_grant" },
    });
    return entitlement;
  } catch (error) {
    if (isUniqueViolation(error, "course_entitlements_active_key")) throw new AppError("ALREADY_ENTITLED");
    throw error;
  }
}

export async function revokeEntitlement(
  executor: Executor,
  actor: Actor,
  params: { entitlementId: string; reason: string },
  meta: RequestMeta,
): Promise<void> {
  assertCan(actor, "entitlements.revoke");
  const [revoked] = await executor
    .update(courseEntitlements)
    .set({ status: "revoked", revokedAt: new Date(), revokedBy: actor.userId, revokeReason: params.reason })
    .where(and(eq(courseEntitlements.id, params.entitlementId), eq(courseEntitlements.status, "active")))
    .returning({ userId: courseEntitlements.userId, courseId: courseEntitlements.courseId });
  if (!revoked) throw new AppError("NOT_FOUND");
  await recordAudit(executor, {
    action: "entitlement.revoked",
    actorUserId: actor.userId,
    targetType: "user",
    targetId: revoked.userId,
    meta,
    metadata: { entitlementId: params.entitlementId, courseId: revoked.courseId, reason: params.reason },
  });
}
