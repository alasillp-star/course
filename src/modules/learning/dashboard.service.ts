import "server-only";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import {
  assignments,
  certificates,
  communityPosts,
  communitySpaces,
  liveSessions,
  notifications,
  profiles,
  studentNotes,
} from "@/server/db/schema";
import type { Actor } from "../access/actor";
import { getCourseOutline, getLearnerProgress, getMainCourse } from "../catalog/catalog.service";
import { hasCourseAccess, listUserEntitlements } from "../entitlements/entitlements.service";
import { pickContinueLesson } from "./lesson.service";

/** Everything the student dashboard renders, from real data only. */
export async function getStudentDashboard(actor: Actor) {
  const db = getDb();
  const course = await getMainCourse();
  const [profileRows, entitlements, hasAccess] = await Promise.all([
    db
      .select({ displayName: profiles.displayName, fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.userId, actor.userId)),
    listUserEntitlements(db, actor.userId),
    course ? hasCourseAccess(db, actor.userId, course.id) : Promise.resolve(false),
  ]);

  const [
    outline,
    progress,
    upcoming,
    latestNotifications,
    unread,
    notesCount,
    certificateRows,
    openAssignments,
    latestPosts,
  ] = await Promise.all([
    course && hasAccess ? getCourseOutline(course.id) : Promise.resolve([]),
    course && hasAccess ? getLearnerProgress(actor.userId, course.id) : Promise.resolve(null),
    course && hasAccess
      ? db
          .select({
            id: liveSessions.id,
            title: liveSessions.title,
            startsAt: liveSessions.startsAt,
            kind: liveSessions.kind,
          })
          .from(liveSessions)
          .where(
            and(
              eq(liveSessions.courseId, course.id),
              eq(liveSessions.status, "scheduled"),
              gt(liveSessions.startsAt, sql`now()`),
              isNull(liveSessions.deletedAt),
            ),
          )
          .orderBy(liveSessions.startsAt)
          .limit(3)
      : Promise.resolve([]),
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        data: notifications.data,
        link: notifications.link,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, actor.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(5),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt))),
    db
      .select({ value: count() })
      .from(studentNotes)
      .where(and(eq(studentNotes.userId, actor.userId), isNull(studentNotes.deletedAt))),
    db
      .select({
        id: certificates.id,
        number: certificates.certificateNumber,
        issuedAt: certificates.issuedAt,
        courseTitle: certificates.courseTitleSnapshot,
      })
      .from(certificates)
      .where(and(eq(certificates.userId, actor.userId), isNull(certificates.revokedAt))),
    course && hasAccess
      ? db
          .select({ id: assignments.id, title: assignments.title })
          .from(assignments)
          .where(
            and(
              eq(assignments.courseId, course.id),
              eq(assignments.status, "published"),
              isNull(assignments.deletedAt),
            ),
          )
          .limit(3)
      : Promise.resolve([]),
    course && hasAccess
      ? db
          .select({
            id: communityPosts.id,
            title: communityPosts.title,
            body: communityPosts.body,
            createdAt: communityPosts.createdAt,
          })
          .from(communityPosts)
          .innerJoin(communitySpaces, eq(communitySpaces.id, communityPosts.spaceId))
          .where(
            and(
              eq(communitySpaces.courseId, course.id),
              eq(communityPosts.status, "published"),
              isNull(communityPosts.deletedAt),
            ),
          )
          .orderBy(desc(communityPosts.lastActivityAt))
          .limit(3)
      : Promise.resolve([]),
  ]);

  const totalLessons = outline.reduce((sum, module) => sum + module.lessons.length, 0);
  const completed = progress
    ? outline
        .flatMap((module) => module.lessons)
        .filter((lesson) => progress.completedLessonIds.has(lesson.id)).length
    : 0;
  const orderedLessons = outline.flatMap((module) => module.lessons);
  const continueLessonId = progress
    ? pickContinueLesson(
        orderedLessons.map((lesson) => lesson.id),
        progress.completedLessonIds,
        progress.lastLessonId,
      )
    : null;

  return {
    displayName: profileRows[0]?.displayName ?? profileRows[0]?.fullName ?? null,
    course,
    hasAccess,
    entitlement:
      entitlements.find((row) => row.courseId === course?.id && row.status === "active") ?? null,
    outline: outline.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => ({
        ...lesson,
        completed: progress?.completedLessonIds.has(lesson.id) ?? false,
      })),
      completedLessons: progress
        ? module.lessons.filter((lesson) => progress.completedLessonIds.has(lesson.id)).length
        : 0,
    })),
    continueLesson: continueLessonId
      ? (orderedLessons.find((lesson) => lesson.id === continueLessonId) ?? null)
      : null,
    totalLessons,
    completedLessons: completed,
    percent: totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0,
    upcoming,
    notifications: latestNotifications,
    unreadNotifications: Number(unread[0]?.value ?? 0),
    notesCount: Number(notesCount[0]?.value ?? 0),
    certificates: certificateRows,
    assignments: openAssignments,
    communityPosts: latestPosts,
  };
}

/** The course page: full outline with completion, locks and the lesson to continue. */
export async function getCourseOverview(actor: Actor) {
  const course = await getMainCourse();
  if (!course) return null;
  const db = getDb();
  const [hasAccess, outline, progress] = await Promise.all([
    hasCourseAccess(db, actor.userId, course.id),
    getCourseOutline(course.id),
    getLearnerProgress(actor.userId, course.id),
  ]);
  const lessons = outline.flatMap((module) => module.lessons);
  const open = lessons.filter((lesson) => hasAccess || lesson.isFreePreview);
  const continueId = pickContinueLesson(
    open.map((lesson) => lesson.id),
    progress.completedLessonIds,
    progress.lastLessonId,
  );
  const completedLessons = lessons.filter((lesson) =>
    progress.completedLessonIds.has(lesson.id),
  ).length;
  return {
    course,
    hasAccess,
    totalLessons: lessons.length,
    completedLessons,
    percent: lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0,
    started: completedLessons > 0 || !!progress.lastLessonId,
    continueLesson: lessons.find((lesson) => lesson.id === continueId) ?? null,
    outline: outline.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        durationSeconds: lesson.durationSeconds,
        completed: progress.completedLessonIds.has(lesson.id),
        locked: !hasAccess && !lesson.isFreePreview,
      })),
    })),
  };
}
