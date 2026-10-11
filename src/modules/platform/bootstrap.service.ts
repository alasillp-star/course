import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ACADEMY } from "@/config/academy";
import type { Executor } from "@/server/db/client";
import { communitySpaces, courses, profiles, roles, userRoles, users } from "@/server/db/schema";
import { COMMUNITY_SPACE_KEYS, type CommunitySpaceKey } from "@/shared/enums";
import { assignRoleUnchecked, syncAccessCatalog } from "../access/rbac.service";

/**
 * Production-safe, idempotent bootstrap (run on every deploy via `npm run db:seed`):
 *  - permission catalogue and built-in roles,
 *  - the flagship course shell (content is managed from the admin area),
 *  - the community spaces of that course,
 *  - a first Super Admin when none exists (BOOTSTRAP_SUPER_ADMIN_EMAIL).
 * It never creates demo data.
 */

const SPACE_NAMES: Record<CommunitySpaceKey, { ar: string; fr: string; en: string }> = {
  general: { ar: "النقاش العام", fr: "Discussion générale", en: "General discussion" },
  questions: { ar: "الأسئلة والأجوبة", fr: "Questions & réponses", en: "Questions & answers" },
  success_stories: { ar: "قصص النجاح", fr: "Réussites", en: "Success stories" },
  case_studies: { ar: "دراسات الحالة", fr: "Études de cas", en: "Case studies" },
  resources: { ar: "الموارد", fr: "Ressources", en: "Resources" },
  announcements: { ar: "الإعلانات", fr: "Annonces", en: "Announcements" },
  challenges: { ar: "التحديات", fr: "Défis", en: "Challenges" },
};

export async function ensureMainCourse(executor: Executor): Promise<string> {
  const [existing] = await executor.select({ id: courses.id }).from(courses).where(eq(courses.slug, ACADEMY.mainCourseSlug));
  if (existing) return existing.id;
  const [created] = await executor
    .insert(courses)
    .values({
      slug: ACADEMY.mainCourseSlug,
      title: {
        ar: "دورة التجارة الإلكترونية في السوق الليبي",
        fr: "Formation e-commerce : le marché libyen",
        en: "E-commerce course: the Libyan market",
      },
      subtitle: {
        ar: "من بناء المتجر واختيار المنتج الرابح إلى الإعلانات والشحن والتحصيل.",
        fr: "De la boutique et du produit gagnant jusqu'à la publicité, la livraison et l'encaissement.",
        en: "From the store and the winning product to ads, shipping and cash collection.",
      },
      status: "published",
      publishedAt: new Date(),
    })
    .onConflictDoNothing({ target: courses.slug })
    .returning({ id: courses.id });
  if (created) return created.id;
  const [winner] = await executor.select({ id: courses.id }).from(courses).where(eq(courses.slug, ACADEMY.mainCourseSlug));
  return winner!.id;
}

export async function ensureCommunitySpaces(executor: Executor, courseId: string): Promise<void> {
  await executor
    .insert(communitySpaces)
    .values(
      COMMUNITY_SPACE_KEYS.map((key, position) => ({
        courseId,
        key,
        name: SPACE_NAMES[key],
        position,
        postingPolicy: key === "announcements" ? ("staff_only" as const) : ("members" as const),
        allowsVerifiedAnswers: key === "questions",
      })),
    )
    .onConflictDoNothing({ target: [communitySpaces.courseId, communitySpaces.key] });
}

/** Creates the first Super Admin (unverified until they sign in with an e-mailed code). */
export async function ensureBootstrapSuperAdmin(executor: Executor, email: string | undefined): Promise<string | null> {
  if (!email) return null;
  const [existingSuperAdmin] = await executor
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.key, "super_admin"))
    .limit(1);
  if (existingSuperAdmin) return null;
  const normalized = email.trim().toLowerCase();
  let [user] = await executor.select({ id: users.id }).from(users).where(eq(users.email, normalized));
  if (!user) {
    [user] = await executor.insert(users).values({ email: normalized }).returning({ id: users.id });
    await executor.insert(profiles).values({ userId: user!.id }).onConflictDoNothing();
  }
  await assignRoleUnchecked(executor, { userId: user!.id, roleKey: "super_admin" });
  return normalized;
}

export async function bootstrapPlatform(executor: Executor, options: { superAdminEmail?: string }) {
  await syncAccessCatalog(executor);
  const courseId = await ensureMainCourse(executor);
  await ensureCommunitySpaces(executor, courseId);
  const superAdmin = await ensureBootstrapSuperAdmin(executor, options.superAdminEmail);
  const [{ count } = { count: 0 }] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.key, "super_admin")));
  return { courseId, superAdminCreated: superAdmin, superAdmins: count };
}
