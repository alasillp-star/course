import "server-only";
import { and, count, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  activationCodes,
  communityPosts,
  courseEntitlements,
  courseProgress,
  orders,
  postComments,
  roles,
  userRoles,
  users,
} from "@/server/db/schema";
import { assertCan, can, type Actor } from "../access/actor";
import { activeEntitlementCondition } from "../entitlements/entitlements.service";

export type OverviewMetrics = {
  students: { total: number; active30d: number; new7d: number; withAccess: number };
  activation: {
    issued: number;
    available: number;
    sold: number;
    activated: number;
    revoked: number;
    locked: number;
    /** Activated / (sold + activated): share of sold cards that were redeemed. */
    activationRate: number | null;
    activated7d: number;
  };
  learning: { averageCompletion: number | null; completedCourse: number };
  community: { posts30d: number; comments30d: number };
  /** Only present for staff with finance permissions. */
  sales: { paidOrders: number; revenueMinor: number; currency: string } | null;
  generatedAt: Date;
};

const DAY = 24 * 60 * 60_000;

export async function getOverviewMetrics(actor: Actor): Promise<OverviewMetrics> {
  assertCan(actor, "reports.read");
  const db = getDb();
  const since30 = new Date(Date.now() - 30 * DAY);
  const since7 = new Date(Date.now() - 7 * DAY);
  // Raw SQL fragments bypass column mapping: bind timestamps as ISO strings.
  const since30Iso = since30.toISOString();
  const since7Iso = since7.toISOString();
  const studentIds = db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, "student"));

  const [studentRow, codeRows, activated7dRow, learningRow, communityRow, accessRow] = await Promise.all([
    db
      .select({
        total: count(),
        active30d: sql<number>`count(*) filter (where ${users.lastSeenAt} >= ${since30Iso}::timestamptz)::int`,
        new7d: sql<number>`count(*) filter (where ${users.createdAt} >= ${since7Iso}::timestamptz)::int`,
      })
      .from(users)
      .where(and(sql`${users.id} in ${studentIds}`, eq(users.status, "active"))),
    db
      .select({
        status: activationCodes.status,
        total: count(),
        locked: sql<number>`count(*) filter (where ${activationCodes.lockedAt} is not null)::int`,
      })
      .from(activationCodes)
      .groupBy(activationCodes.status),
    db
      .select({ total: count() })
      .from(activationCodes)
      .where(and(isNotNull(activationCodes.activatedAt), gte(activationCodes.activatedAt, since7))),
    db
      .select({
        average: sql<number | null>`round(avg(${courseProgress.percentComplete}))::int`,
        completed: sql<number>`count(*) filter (where ${courseProgress.completedAt} is not null)::int`,
      })
      .from(courseProgress),
    db
      .select({
        posts: sql<number>`(select count(*)::int from ${communityPosts} where ${communityPosts.createdAt} >= ${since30Iso}::timestamptz)`,
        comments: sql<number>`(select count(*)::int from ${postComments} where ${postComments.createdAt} >= ${since30Iso}::timestamptz)`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({ total: sql<number>`count(distinct ${courseEntitlements.userId})::int` })
      .from(courseEntitlements)
      .where(activeEntitlementCondition()),
  ]);

  const byStatus = { available: 0, sold: 0, activated: 0, revoked: 0 } as Record<string, number>;
  let locked = 0;
  for (const row of codeRows) {
    byStatus[row.status] = Number(row.total);
    locked += Number(row.locked);
  }
  const issued = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
  const soldOrActivated = (byStatus.sold ?? 0) + (byStatus.activated ?? 0);

  let sales: OverviewMetrics["sales"] = null;
  if (can(actor, "finance.reports.read")) {
    const [row] = await db
      .select({
        paidOrders: count(),
        revenue: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::bigint`,
      })
      .from(orders)
      .where(eq(orders.status, "paid"));
    sales = { paidOrders: Number(row?.paidOrders ?? 0), revenueMinor: Number(row?.revenue ?? 0), currency: "DZD" };
  }

  return {
    students: {
      total: Number(studentRow[0]?.total ?? 0),
      active30d: Number(studentRow[0]?.active30d ?? 0),
      new7d: Number(studentRow[0]?.new7d ?? 0),
      withAccess: Number(accessRow[0]?.total ?? 0),
    },
    activation: {
      issued,
      available: byStatus.available ?? 0,
      sold: byStatus.sold ?? 0,
      activated: byStatus.activated ?? 0,
      revoked: byStatus.revoked ?? 0,
      locked,
      activationRate: soldOrActivated > 0 ? (byStatus.activated ?? 0) / soldOrActivated : null,
      activated7d: Number(activated7dRow[0]?.total ?? 0),
    },
    learning: {
      averageCompletion: learningRow[0]?.average ?? null,
      completedCourse: Number(learningRow[0]?.completed ?? 0),
    },
    community: {
      posts30d: Number(communityRow[0]?.posts ?? 0),
      comments30d: Number(communityRow[0]?.comments ?? 0),
    },
    sales,
    generatedAt: new Date(),
  };
}
