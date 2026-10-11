import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CONTENT_STATUSES, QUIZ_QUESTION_TYPES, SUBMISSION_STATUSES } from "../../../shared/enums";
import {
  createdAt,
  deletedAt,
  enumCheck,
  localized,
  pk,
  rule,
  tstz,
  updatedAt,
} from "./_columns";
import { courseModules, courses, lessons, mediaAssets } from "./catalog";
import { users } from "./identity";

export const quizzes = pgTable(
  "quizzes",
  {
    id: pk(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid().references(() => lessons.id, { onDelete: "cascade" }),
    moduleId: uuid().references(() => courseModules.id, { onDelete: "cascade" }),
    title: localized().notNull(),
    description: localized(),
    passScorePercent: smallint().notNull().default(70),
    /** NULL = unlimited attempts. */
    maxAttempts: smallint(),
    timeLimitSeconds: integer(),
    shuffleQuestions: boolean().notNull().default(false),
    showCorrectAnswers: boolean().notNull().default(true),
    status: text({ enum: CONTENT_STATUSES }).notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("quizzes_status_check", t.status, CONTENT_STATUSES),
    rule("quizzes_pass_score_check", sql`${t.passScorePercent} between 0 and 100`),
    rule("quizzes_max_attempts_check", sql`${t.maxAttempts} is null or ${t.maxAttempts} > 0`),
    index("quizzes_lesson_idx").on(t.lessonId),
  ],
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: pk(),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    type: text({ enum: QUIZ_QUESTION_TYPES }).notNull(),
    prompt: localized().notNull(),
    explanation: localized(),
    points: smallint().notNull().default(1),
    position: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck("quiz_questions_type_check", t.type, QUIZ_QUESTION_TYPES),
    rule("quiz_questions_points_check", sql`${t.points} > 0`),
    index("quiz_questions_quiz_idx").on(t.quizId, t.position),
  ],
);

export const quizQuestionOptions = pgTable(
  "quiz_question_options",
  {
    id: pk(),
    questionId: uuid()
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    label: localized().notNull(),
    isCorrect: boolean().notNull().default(false),
    position: integer().notNull(),
  },
  (t) => [index("quiz_question_options_question_idx").on(t.questionId, t.position)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: pk(),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    attemptNumber: smallint().notNull(),
    startedAt: tstz().notNull().defaultNow(),
    submittedAt: tstz(),
    /** {questionId: optionId[]} as submitted; graded server-side. */
    answers: jsonb().$type<Record<string, string[]>>().notNull().default({}),
    scorePercent: smallint(),
    passed: boolean(),
  },
  (t) => [
    uniqueIndex("quiz_attempts_user_attempt_key").on(t.quizId, t.userId, t.attemptNumber),
    rule(
      "quiz_attempts_score_check",
      sql`${t.scorePercent} is null or ${t.scorePercent} between 0 and 100`,
    ),
    index("quiz_attempts_user_idx").on(t.userId, t.quizId),
  ],
);

export const assignments = pgTable(
  "assignments",
  {
    id: pk(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: uuid().references(() => lessons.id, { onDelete: "cascade" }),
    title: localized().notNull(),
    instructions: localized().notNull(),
    maxScore: smallint().notNull().default(100),
    passScore: smallint().notNull().default(60),
    allowResubmission: boolean().notNull().default(true),
    acceptsFiles: boolean().notNull().default(true),
    acceptsLinks: boolean().notNull().default(true),
    status: text({ enum: CONTENT_STATUSES }).notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("assignments_status_check", t.status, CONTENT_STATUSES),
    rule("assignments_scores_check", sql`${t.passScore} between 0 and ${t.maxScore}`),
    index("assignments_lesson_idx").on(t.lessonId),
  ],
);

export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: pk(),
    assignmentId: uuid()
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    attemptNumber: smallint().notNull().default(1),
    status: text({ enum: SUBMISSION_STATUSES }).notNull().default("submitted"),
    textAnswer: text(),
    links: jsonb().$type<string[]>().notNull().default([]),
    submittedAt: tstz().notNull().defaultNow(),
    gradedAt: tstz(),
    gradedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    score: smallint(),
    /** Private feedback visible only to the student and staff. */
    feedback: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck("assignment_submissions_status_check", t.status, SUBMISSION_STATUSES),
    uniqueIndex("assignment_submissions_attempt_key").on(t.assignmentId, t.userId, t.attemptNumber),
    index("assignment_submissions_review_queue_idx").on(t.status, t.submittedAt),
  ],
);

export const submissionAttachments = pgTable(
  "submission_attachments",
  {
    id: pk(),
    submissionId: uuid()
      .notNull()
      .references(() => assignmentSubmissions.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index("submission_attachments_submission_idx").on(t.submissionId)],
);

/**
 * Completion certificates. `certificate_number` is printed on the PDF and in a
 * QR code pointing to the public verification page; snapshots keep the
 * certificate stable if the student renames their profile later.
 */
export const certificates = pgTable(
  "certificates",
  {
    id: pk(),
    certificateNumber: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    recipientNameSnapshot: text().notNull(),
    courseTitleSnapshot: localized().notNull(),
    issuedAt: tstz().notNull().defaultNow(),
    issuedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    revokedAt: tstz(),
    revokeReason: text(),
    pdfStorageKey: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("certificates_number_key").on(t.certificateNumber),
    uniqueIndex("certificates_user_course_active_key")
      .on(t.userId, t.courseId)
      .where(sql`${t.revokedAt} is null`),
  ],
);
