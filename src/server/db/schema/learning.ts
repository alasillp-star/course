import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { LESSON_PROGRESS_STATUSES } from "../../../shared/enums";
import { createdAt, deletedAt, enumCheck, pk, rule, tstz, updatedAt } from "./_columns";
import { courses, lessons, mediaAssets } from "./catalog";
import { users } from "./identity";

/**
 * Per-lesson completion. Video watching only feeds `percent_complete`; quizzes
 * and assignments track their own pass state, so watching a video never counts
 * as passing an assessment.
 */
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: text({ enum: LESSON_PROGRESS_STATUSES }).notNull().default("in_progress"),
    percentComplete: smallint().notNull().default(0),
    firstStartedAt: tstz().notNull().defaultNow(),
    completedAt: tstz(),
    lastActivityAt: tstz().notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.lessonId] }),
    enumCheck("lesson_progress_status_check", t.status, LESSON_PROGRESS_STATUSES),
    rule("lesson_progress_percent_check", sql`${t.percentComplete} between 0 and 100`),
    rule(
      "lesson_progress_completed_check",
      sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`,
    ),
    index("lesson_progress_course_user_idx").on(t.courseId, t.userId),
  ],
);

/** Resume position and watch statistics for a lesson video. */
export const videoProgress = pgTable(
  "video_progress",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    assetId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
    positionSeconds: integer().notNull().default(0),
    durationSeconds: integer(),
    /** Seconds of distinct content watched (server-validated, not trusted blindly). */
    watchedSeconds: integer().notNull().default(0),
    maxPositionSeconds: integer().notNull().default(0),
    /** Merged [start, end) second ranges actually watched; watchedSeconds is their total. */
    watchedRanges: jsonb().$type<Array<[number, number]>>().notNull().default([]),
    /** Time of the last accepted heartbeat: new coverage is capped by elapsed time. */
    lastHeartbeatAt: tstz(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.lessonId] }),
    rule(
      "video_progress_non_negative_check",
      sql`${t.positionSeconds} >= 0 and ${t.watchedSeconds} >= 0 and ${t.maxPositionSeconds} >= 0`,
    ),
  ],
);

/** Denormalised course-level progress used by dashboards and reports. */
export const courseProgress = pgTable(
  "course_progress",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    completedLessons: integer().notNull().default(0),
    totalLessons: integer().notNull().default(0),
    percentComplete: smallint().notNull().default(0),
    lastLessonId: uuid().references(() => lessons.id, { onDelete: "set null" }),
    lastActivityAt: tstz(),
    completedAt: tstz(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.courseId] }),
    rule("course_progress_percent_check", sql`${t.percentComplete} between 0 and 100`),
    index("course_progress_course_activity_idx").on(t.courseId, t.lastActivityAt),
  ],
);

export const studentNotes = pgTable(
  "student_notes",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    /** Optional video timestamp the note is anchored to. */
    videoTimestampSeconds: integer(),
    body: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    rule("student_notes_body_length_check", sql`char_length(${t.body}) between 1 and 10000`),
    index("student_notes_user_lesson_idx").on(t.userId, t.lessonId),
  ],
);
