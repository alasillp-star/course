import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import {
  courseModules,
  courseProgress,
  courses,
  lessonProgress,
  lessonResources,
  lessons,
  mediaAssets,
  studentNotes,
  videoProgress,
} from "@/server/db/schema";
import { AppError } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { enforceRateLimit } from "@/server/rate-limit";
import { requireStorage } from "@/server/storage";
import { requireVideoProvider } from "@/server/video";
import { can, type Actor } from "../access/actor";
import { getCourseOutline } from "../catalog/catalog.service";
import { hasCourseAccess } from "../entitlements/entitlements.service";
import { maskEmail } from "../identity/email";
import {
  addCoverageWithBudget,
  coverage,
  heartbeatBudget,
  normalizeRanges,
  percentWatched,
  resumePosition,
  type Range,
} from "./progress-math";

/**
 * Learner side of the course: who may open a lesson, signed playback,
 * server-validated progress, completion, notes and resource downloads.
 * Access = an active entitlement (hasCourseAccess): everyone who activated a
 * card sees every published lesson. Staff with content.read may preview
 * anything (drafts included) without being tracked.
 */

const visibleNow = (status: string, publishAt: Date | null, now: Date) =>
  status === "published" && (!publishAt || publishAt.getTime() <= now.getTime());

export type LessonContext = Awaited<ReturnType<typeof resolveLessonAccess>>;

export async function resolveLessonAccess(
  actor: Actor,
  lessonId: string,
  executor: Executor = getDb(),
) {
  const [row] = await executor
    .select({
      lesson: lessons,
      module: {
        id: courseModules.id,
        title: courseModules.title,
        status: courseModules.status,
        publishAt: courseModules.publishAt,
      },
      course: {
        id: courses.id,
        slug: courses.slug,
        title: courses.title,
        status: courses.status,
      },
    })
    .from(lessons)
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .where(
      and(
        eq(lessons.id, lessonId),
        isNull(lessons.deletedAt),
        isNull(courseModules.deletedAt),
        isNull(courses.deletedAt),
      ),
    );
  if (!row) throw new AppError("NOT_FOUND");
  const now = new Date();
  const staff = can(actor, "content.read");
  const visible =
    row.course.status === "published" &&
    visibleNow(row.module.status, row.module.publishAt, now) &&
    visibleNow(row.lesson.status, row.lesson.publishAt, now);
  if (!visible && !staff) throw new AppError("NOT_FOUND");
  const entitled = await hasCourseAccess(executor, actor.userId, row.course.id);
  if (!entitled && !staff) throw new AppError("COURSE_ACCESS_REQUIRED");
  return {
    ...row,
    entitled,
    visible,
    /** Progress is only recorded for enrolled students on published lessons. */
    tracked: entitled && visible,
    staff,
    preview: staff && (!visible || !entitled),
  };
}

async function loadVideoAsset(executor: Executor, assetId: string | null) {
  if (!assetId) return null;
  const [asset] = await executor
    .select({
      id: mediaAssets.id,
      provider: mediaAssets.provider,
      status: mediaAssets.status,
      playbackId: mediaAssets.playbackId,
      durationSeconds: mediaAssets.durationSeconds,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), isNull(mediaAssets.deletedAt)));
  return asset ?? null;
}

/** Everything the lesson page renders. */
export async function getLessonPage(actor: Actor, lessonId: string) {
  const db = getDb();
  const ctx = await resolveLessonAccess(actor, lessonId, db);
  const { lesson, course } = ctx;
  const [outline, completedRows, lessonRow, videoRow, resources, notes, video] = await Promise.all([
    getCourseOutline(course.id),
    db
      .select({ lessonId: lessonProgress.lessonId })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, actor.userId),
          eq(lessonProgress.courseId, course.id),
          eq(lessonProgress.status, "completed"),
        ),
      ),
    db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, actor.userId), eq(lessonProgress.lessonId, lessonId)))
      .then((rows) => rows[0] ?? null),
    db
      .select({
        positionSeconds: videoProgress.positionSeconds,
        watchedSeconds: videoProgress.watchedSeconds,
      })
      .from(videoProgress)
      .where(and(eq(videoProgress.userId, actor.userId), eq(videoProgress.lessonId, lessonId)))
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: lessonResources.id,
        kind: lessonResources.kind,
        title: lessonResources.title,
        url: lessonResources.url,
        filename: mediaAssets.originalFilename,
        sizeBytes: mediaAssets.sizeBytes,
        assetStatus: mediaAssets.status,
      })
      .from(lessonResources)
      .leftJoin(mediaAssets, eq(mediaAssets.id, lessonResources.assetId))
      .where(eq(lessonResources.lessonId, lessonId))
      .orderBy(asc(lessonResources.position), asc(lessonResources.createdAt)),
    listLessonNotesFor(db, actor.userId, lessonId),
    loadVideoAsset(db, lesson.videoAssetId),
  ]);

  const completed = new Set(completedRows.map((row) => row.lessonId));
  const flat = outline.flatMap((module) => module.lessons.map((item) => ({ ...item, module })));
  const index = flat.findIndex((item) => item.id === lesson.id);
  const canOpen = ctx.entitled || ctx.staff;
  const duration = video?.durationSeconds ?? lesson.durationSeconds ?? null;

  return {
    course,
    module: ctx.module,
    lesson: {
      id: lesson.id,
      title: lesson.title,
      summary: lesson.summary,
      body: lesson.body,
      durationSeconds: duration,
      completionThresholdPercent: lesson.completionThresholdPercent,
      hasVideo: !!lesson.videoAssetId,
      videoReady: video?.status === "ready",
    },
    access: { entitled: ctx.entitled, tracked: ctx.tracked, preview: ctx.preview },
    progress: {
      status: lessonRow?.status ?? null,
      percent: lessonRow?.percentComplete ?? 0,
      resumeAt: resumePosition(videoRow?.positionSeconds ?? 0, duration),
    },
    outline: outline.map((module) => ({
      id: module.id,
      title: module.title,
      lessons: module.lessons.map((item) => ({
        id: item.id,
        title: item.title,
        durationSeconds: item.durationSeconds,
        completed: completed.has(item.id),
        locked: !canOpen,
        current: item.id === lesson.id,
      })),
    })),
    previous: index > 0 ? flat[index - 1]!.id : null,
    next: index >= 0 && index < flat.length - 1 && canOpen ? flat[index + 1]!.id : null,
    resources: resources
      .filter((resource) => resource.kind === "link" || resource.assetStatus === "ready")
      .map((resource) => ({
        id: resource.id,
        kind: resource.kind,
        title: resource.title,
        url: resource.kind === "link" ? resource.url : null,
        filename: resource.filename,
        sizeBytes: resource.sizeBytes,
      })),
    notes,
  };
}

/** Visible watermark: identifies the viewer to staff without exposing the full e-mail. */
export function watermarkFor(actor: Pick<Actor, "email" | "userId">): string {
  return `${maskEmail(actor.email)} · ${actor.userId.slice(0, 8)}`;
}

/** A short-lived, viewer-bound playback source — only after the access check. */
export async function issuePlayback(actor: Actor, lessonId: string) {
  await enforceRateLimit("playback:user", actor.userId);
  const db = getDb();
  const ctx = await resolveLessonAccess(actor, lessonId, db);
  const asset = await loadVideoAsset(db, ctx.lesson.videoAssetId);
  if (!asset || asset.status !== "ready" || !asset.playbackId) {
    throw new AppError("VIDEO_NOT_READY");
  }
  const provider = requireVideoProvider();
  if (provider.name !== asset.provider) {
    logger.warn("video hosted by another provider than the configured one", {
      assetId: asset.id,
      assetProvider: asset.provider,
    });
    throw new AppError("VIDEO_NOT_READY");
  }
  const duration = asset.durationSeconds ?? 3600;
  // Long enough to finish the lesson with pauses; the player refreshes it if needed.
  const ttlSeconds = Math.min(6 * 3600, Math.max(1800, duration * 2 + 600));
  const source = await provider.playback({
    playbackId: asset.playbackId,
    viewerId: actor.userId,
    ttlSeconds,
    mimeType: asset.mimeType,
  });
  return { ...source, watermark: watermarkFor(actor) };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

async function visibleLessonIds(executor: Executor, courseId: string) {
  const rows = await executor
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .where(
      and(
        eq(lessons.courseId, courseId),
        isNull(lessons.deletedAt),
        isNull(courseModules.deletedAt),
        eq(lessons.status, "published"),
        eq(courseModules.status, "published"),
        or(isNull(lessons.publishAt), lte(lessons.publishAt, sql`now()`)),
        or(isNull(courseModules.publishAt), lte(courseModules.publishAt, sql`now()`)),
      ),
    );
  return rows.map((row) => row.id);
}

/** Recomputes the denormalised course_progress row (dashboards, reports). */
async function updateCourseProgress(
  executor: Executor,
  userId: string,
  courseId: string,
  lastLessonId: string,
  recount: boolean,
) {
  const now = new Date();
  if (!recount) {
    await executor
      .insert(courseProgress)
      .values({ userId, courseId, lastLessonId, lastActivityAt: now })
      .onConflictDoUpdate({
        target: [courseProgress.userId, courseProgress.courseId],
        set: { lastLessonId, lastActivityAt: now },
      });
    return;
  }
  const ids = await visibleLessonIds(executor, courseId);
  const [done] =
    ids.length === 0
      ? [{ value: 0 }]
      : await executor
          .select({ value: count() })
          .from(lessonProgress)
          .where(
            and(
              eq(lessonProgress.userId, userId),
              eq(lessonProgress.status, "completed"),
              inArray(lessonProgress.lessonId, ids),
            ),
          );
  const completedLessons = Number(done?.value ?? 0);
  const totalLessons = ids.length;
  const percent = totalLessons ? Math.floor((completedLessons * 100) / totalLessons) : 0;
  const finished = totalLessons > 0 && completedLessons >= totalLessons;
  await executor
    .insert(courseProgress)
    .values({
      userId,
      courseId,
      completedLessons,
      totalLessons,
      percentComplete: percent,
      lastLessonId,
      lastActivityAt: now,
      completedAt: finished ? now : null,
    })
    .onConflictDoUpdate({
      target: [courseProgress.userId, courseProgress.courseId],
      set: {
        completedLessons,
        totalLessons,
        percentComplete: percent,
        lastLessonId,
        lastActivityAt: now,
        completedAt: finished
          ? sql`coalesce(${courseProgress.completedAt}, ${now.toISOString()}::timestamptz)`
          : null,
      },
    });
}

async function markLessonProgress(
  executor: Executor,
  params: {
    userId: string;
    lessonId: string;
    courseId: string;
    percent: number;
    complete: boolean;
  },
): Promise<{ completed: boolean; newlyCompleted: boolean; percent: number }> {
  const now = new Date();
  const [existing] = await executor
    .select()
    .from(lessonProgress)
    .where(
      and(eq(lessonProgress.userId, params.userId), eq(lessonProgress.lessonId, params.lessonId)),
    )
    .for("update");
  const alreadyCompleted = existing?.status === "completed";
  const completed = alreadyCompleted || params.complete;
  const percent = Math.max(existing?.percentComplete ?? 0, params.percent);
  if (existing) {
    await executor
      .update(lessonProgress)
      .set({
        percentComplete: percent,
        lastActivityAt: now,
        status: completed ? "completed" : "in_progress",
        completedAt: existing.completedAt ?? (completed ? now : null),
      })
      .where(
        and(eq(lessonProgress.userId, params.userId), eq(lessonProgress.lessonId, params.lessonId)),
      );
  } else {
    await executor.insert(lessonProgress).values({
      userId: params.userId,
      lessonId: params.lessonId,
      courseId: params.courseId,
      percentComplete: percent,
      status: completed ? "completed" : "in_progress",
      completedAt: completed ? now : null,
      lastActivityAt: now,
    });
  }
  return { completed, newlyCompleted: completed && !alreadyCompleted, percent };
}

/**
 * Player heartbeat. New watched coverage is capped by the time elapsed since
 * the previous heartbeat (see progress-math), so completion cannot be faked
 * faster than real viewing at the maximum playback speed.
 */
export async function recordHeartbeat(
  actor: Actor,
  lessonId: string,
  input: { positionSeconds: number; playedRanges: Array<[number, number]> },
) {
  await enforceRateLimit("progress:user", actor.userId);
  const db = getDb();
  const ctx = await resolveLessonAccess(actor, lessonId, db);
  if (!ctx.tracked) return { recorded: false as const };
  const asset = await loadVideoAsset(db, ctx.lesson.videoAssetId);
  const duration = asset?.durationSeconds ?? ctx.lesson.durationSeconds ?? null;

  return db.transaction(async (tx) => {
    await tx
      .insert(videoProgress)
      .values({ userId: actor.userId, lessonId, assetId: asset?.id ?? null })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(videoProgress)
      .where(and(eq(videoProgress.userId, actor.userId), eq(videoProgress.lessonId, lessonId)))
      .for("update");
    if (!row) throw new Error("video progress row missing");
    const now = new Date();
    const position = Math.max(0, Math.min(Math.floor(input.positionSeconds), duration ?? 6 * 3600));
    let ranges = row.watchedRanges as Range[];
    if (duration) {
      const incoming = normalizeRanges(input.playedRanges, duration);
      ranges = addCoverageWithBudget(
        ranges,
        incoming,
        heartbeatBudget(row.lastHeartbeatAt, now),
      ).ranges;
    }
    const watched = coverage(ranges);
    await tx
      .update(videoProgress)
      .set({
        assetId: asset?.id ?? row.assetId,
        positionSeconds: position,
        durationSeconds: duration,
        watchedSeconds: watched,
        maxPositionSeconds: Math.max(row.maxPositionSeconds, position),
        watchedRanges: ranges,
        lastHeartbeatAt: now,
      })
      .where(and(eq(videoProgress.userId, actor.userId), eq(videoProgress.lessonId, lessonId)));

    const percent = duration ? percentWatched(watched, duration) : 0;
    const result = await markLessonProgress(tx, {
      userId: actor.userId,
      lessonId,
      courseId: ctx.course.id,
      percent,
      complete: !!duration && percent >= ctx.lesson.completionThresholdPercent,
    });
    await updateCourseProgress(tx, actor.userId, ctx.course.id, lessonId, result.newlyCompleted);
    return {
      recorded: true as const,
      percent: result.percent,
      completed: result.completed,
      watchedSeconds: watched,
    };
  });
}

/** Manual completion, for lessons without a video (reading, exercises). */
export async function completeLesson(actor: Actor, lessonId: string) {
  await enforceRateLimit("progress:user", actor.userId);
  const db = getDb();
  const ctx = await resolveLessonAccess(actor, lessonId, db);
  if (!ctx.tracked) throw new AppError("COURSE_ACCESS_REQUIRED");
  const asset = await loadVideoAsset(db, ctx.lesson.videoAssetId);
  if (asset?.status === "ready") {
    throw new AppError("INVALID_STATE", "Video lessons complete by watching");
  }
  return db.transaction(async (tx) => {
    const result = await markLessonProgress(tx, {
      userId: actor.userId,
      lessonId,
      courseId: ctx.course.id,
      percent: 100,
      complete: true,
    });
    await updateCourseProgress(tx, actor.userId, ctx.course.id, lessonId, result.newlyCompleted);
    return { completed: true };
  });
}

/** The lesson "Continue" should open: last one touched if unfinished, else the next unfinished. */
export function pickContinueLesson(
  orderedLessonIds: string[],
  completed: ReadonlySet<string>,
  lastLessonId: string | null,
): string | null {
  if (orderedLessonIds.length === 0) return null;
  const lastIndex = lastLessonId ? orderedLessonIds.indexOf(lastLessonId) : -1;
  if (lastIndex >= 0 && !completed.has(orderedLessonIds[lastIndex]!)) {
    return orderedLessonIds[lastIndex]!;
  }
  const after = orderedLessonIds.slice(lastIndex + 1).find((id) => !completed.has(id));
  return after ?? orderedLessonIds.find((id) => !completed.has(id)) ?? orderedLessonIds[0] ?? null;
}

// ---------------------------------------------------------------------------
// Notes (private to their author)
// ---------------------------------------------------------------------------

function listLessonNotesFor(executor: Executor, userId: string, lessonId: string) {
  return executor
    .select({
      id: studentNotes.id,
      body: studentNotes.body,
      videoTimestampSeconds: studentNotes.videoTimestampSeconds,
      createdAt: studentNotes.createdAt,
      updatedAt: studentNotes.updatedAt,
    })
    .from(studentNotes)
    .where(
      and(
        eq(studentNotes.userId, userId),
        eq(studentNotes.lessonId, lessonId),
        isNull(studentNotes.deletedAt),
      ),
    )
    .orderBy(
      sql`${studentNotes.videoTimestampSeconds} asc nulls last`,
      asc(studentNotes.createdAt),
    );
}

export async function listLessonNotes(actor: Actor, lessonId: string) {
  const db = getDb();
  await resolveLessonAccess(actor, lessonId, db);
  return listLessonNotesFor(db, actor.userId, lessonId);
}

export async function createNote(
  actor: Actor,
  lessonId: string,
  input: { body: string; videoTimestampSeconds?: number | null },
) {
  await enforceRateLimit("notes:user", actor.userId);
  const db = getDb();
  const ctx = await resolveLessonAccess(actor, lessonId, db);
  const [note] = await db
    .insert(studentNotes)
    .values({
      userId: actor.userId,
      courseId: ctx.course.id,
      lessonId,
      body: input.body,
      videoTimestampSeconds:
        input.videoTimestampSeconds === null || input.videoTimestampSeconds === undefined
          ? null
          : Math.max(0, Math.floor(input.videoTimestampSeconds)),
    })
    .returning({
      id: studentNotes.id,
      body: studentNotes.body,
      videoTimestampSeconds: studentNotes.videoTimestampSeconds,
      createdAt: studentNotes.createdAt,
      updatedAt: studentNotes.updatedAt,
    });
  return note;
}

export async function updateNote(actor: Actor, noteId: string, input: { body: string }) {
  await enforceRateLimit("notes:user", actor.userId);
  const [note] = await getDb()
    .update(studentNotes)
    .set({ body: input.body })
    .where(
      and(
        eq(studentNotes.id, noteId),
        eq(studentNotes.userId, actor.userId),
        isNull(studentNotes.deletedAt),
      ),
    )
    .returning({
      id: studentNotes.id,
      body: studentNotes.body,
      videoTimestampSeconds: studentNotes.videoTimestampSeconds,
      createdAt: studentNotes.createdAt,
      updatedAt: studentNotes.updatedAt,
    });
  if (!note) throw new AppError("NOT_FOUND");
  return note;
}

export async function deleteNote(actor: Actor, noteId: string) {
  const [note] = await getDb()
    .update(studentNotes)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(studentNotes.id, noteId),
        eq(studentNotes.userId, actor.userId),
        isNull(studentNotes.deletedAt),
      ),
    )
    .returning({ id: studentNotes.id });
  if (!note) throw new AppError("NOT_FOUND");
}

/** All of the student's notes, newest lessons first (notes page). */
export async function listMyNotes(actor: Actor) {
  return getDb()
    .select({
      id: studentNotes.id,
      body: studentNotes.body,
      videoTimestampSeconds: studentNotes.videoTimestampSeconds,
      updatedAt: studentNotes.updatedAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
    })
    .from(studentNotes)
    .innerJoin(lessons, eq(lessons.id, studentNotes.lessonId))
    .where(
      and(
        eq(studentNotes.userId, actor.userId),
        isNull(studentNotes.deletedAt),
        isNull(lessons.deletedAt),
      ),
    )
    .orderBy(desc(studentNotes.updatedAt))
    .limit(500);
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/** Short-lived download URL for a lesson file, after the access check. */
export async function getResourceDownloadUrl(actor: Actor, lessonId: string, resourceId: string) {
  await enforceRateLimit("download:user", actor.userId);
  const db = getDb();
  await resolveLessonAccess(actor, lessonId, db);
  const [row] = await db
    .select({
      kind: lessonResources.kind,
      url: lessonResources.url,
      storageKey: mediaAssets.storageKey,
      filename: mediaAssets.originalFilename,
      mimeType: mediaAssets.mimeType,
      status: mediaAssets.status,
    })
    .from(lessonResources)
    .leftJoin(mediaAssets, eq(mediaAssets.id, lessonResources.assetId))
    .where(and(eq(lessonResources.id, resourceId), eq(lessonResources.lessonId, lessonId)));
  if (!row) throw new AppError("NOT_FOUND");
  if (row.kind === "link") {
    if (!row.url) throw new AppError("NOT_FOUND");
    return row.url;
  }
  if (row.status !== "ready" || !row.storageKey) throw new AppError("NOT_FOUND");
  return requireStorage().createDownloadUrl({
    key: row.storageKey,
    filename: row.filename ?? "download",
    contentType: row.mimeType ?? "application/octet-stream",
    ttlSeconds: 300,
    viewerId: actor.userId,
  });
}
