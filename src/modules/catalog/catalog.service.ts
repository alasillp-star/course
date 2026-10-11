import "server-only";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { ACADEMY } from "@/config/academy";
import { getDb } from "@/server/db/client";
import {
  courseModules,
  courses,
  lessons,
  lessonProgress,
  courseProgress,
} from "@/server/db/schema";
import type { LocalizedText } from "@/server/db/schema";

export type CourseSummary = {
  id: string;
  slug: string;
  title: LocalizedText;
  subtitle: LocalizedText | null;
  description: LocalizedText | null;
};

/** The flagship course (by configured slug, else the first published course). */
export async function getMainCourse(): Promise<CourseSummary | null> {
  const db = getDb();
  const columns = {
    id: courses.id,
    slug: courses.slug,
    title: courses.title,
    subtitle: courses.subtitle,
    description: courses.description,
  };
  const published = and(eq(courses.status, "published"), isNull(courses.deletedAt));
  const [bySlug] = await db
    .select(columns)
    .from(courses)
    .where(and(published, eq(courses.slug, ACADEMY.mainCourseSlug)));
  if (bySlug) return bySlug;
  const [first] = await db
    .select(columns)
    .from(courses)
    .where(published)
    .orderBy(asc(courses.createdAt))
    .limit(1);
  return first ?? null;
}

const visibleNow = (
  status: typeof courseModules.status | typeof lessons.status,
  publishAt: typeof courseModules.publishAt | typeof lessons.publishAt,
) => and(eq(status, "published"), or(isNull(publishAt), lte(publishAt, sql`now()`)));

export type OutlineModule = {
  id: string;
  position: number;
  title: LocalizedText;
  description: LocalizedText | null;
  lessons: Array<{
    id: string;
    slug: string;
    title: LocalizedText;
    durationSeconds: number | null;
    isFreePreview: boolean;
  }>;
};

/** Published, currently visible modules and lessons in order. */
export async function getCourseOutline(courseId: string): Promise<OutlineModule[]> {
  const db = getDb();
  const [moduleRows, lessonRows] = await Promise.all([
    db
      .select({
        id: courseModules.id,
        position: courseModules.position,
        title: courseModules.title,
        description: courseModules.description,
      })
      .from(courseModules)
      .where(
        and(
          eq(courseModules.courseId, courseId),
          isNull(courseModules.deletedAt),
          visibleNow(courseModules.status, courseModules.publishAt),
        ),
      )
      .orderBy(asc(courseModules.position)),
    db
      .select({
        id: lessons.id,
        moduleId: lessons.moduleId,
        slug: lessons.slug,
        title: lessons.title,
        durationSeconds: lessons.durationSeconds,
        isFreePreview: lessons.isFreePreview,
        position: lessons.position,
      })
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, courseId),
          isNull(lessons.deletedAt),
          visibleNow(lessons.status, lessons.publishAt),
        ),
      )
      .orderBy(asc(lessons.position)),
  ]);
  return moduleRows.map((module) => ({
    ...module,
    lessons: lessonRows
      .filter((lesson) => lesson.moduleId === module.id)
      .map((lesson) => ({
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        durationSeconds: lesson.durationSeconds,
        isFreePreview: lesson.isFreePreview,
      })),
  }));
}

/** Learner progress for a course (counts derived from lesson_progress). */
export async function getLearnerProgress(userId: string, courseId: string) {
  const db = getDb();
  const [completedRows, cached] = await Promise.all([
    db
      .select({
        lessonId: lessonProgress.lessonId,
        status: lessonProgress.status,
        lastActivityAt: lessonProgress.lastActivityAt,
      })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.courseId, courseId))),
    db
      .select({
        lastLessonId: courseProgress.lastLessonId,
        lastActivityAt: courseProgress.lastActivityAt,
      })
      .from(courseProgress)
      .where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseId, courseId))),
  ]);
  return {
    completedLessonIds: new Set(
      completedRows.filter((row) => row.status === "completed").map((row) => row.lessonId),
    ),
    lastLessonId: cached[0]?.lastLessonId ?? null,
    lastActivityAt: cached[0]?.lastActivityAt ?? null,
  };
}
