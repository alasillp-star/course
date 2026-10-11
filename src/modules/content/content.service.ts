import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import {
  courseModules,
  courses,
  lessonResources,
  lessons,
  mediaAssets,
  type LocalizedText,
} from "@/server/db/schema";
import { randomToken } from "@/server/crypto";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import type { ContentStatus, LessonResourceKind, MediaStatus } from "@/shared/enums";
import { assertCan, type Actor } from "../access/actor";
import { recordAudit } from "../audit/audit.service";

/**
 * Course editor (staff). Editing text needs `content.manage`; anything that
 * changes what students see — status and schedule — needs `content.publish`.
 * Deletions are soft (deleted_at), so progress and notes stay consistent.
 */

export type Publication = { status?: ContentStatus; publishAt?: Date | null };

export type EditorLesson = {
  id: string;
  moduleId: string;
  position: number;
  title: LocalizedText;
  status: ContentStatus;
  publishAt: Date | null;
  isFreePreview: boolean;
  durationSeconds: number | null;
  video: { assetId: string; status: MediaStatus } | null;
  pendingVideo: { assetId: string; status: MediaStatus; failureReason: string | null } | null;
  resourceCount: number;
};

export type EditorModule = {
  id: string;
  position: number;
  title: LocalizedText;
  description: LocalizedText | null;
  status: ContentStatus;
  publishAt: Date | null;
  lessons: EditorLesson[];
};

function assertPublication(actor: Actor, publication: Publication) {
  if (publication.status !== undefined || publication.publishAt !== undefined) {
    assertCan(actor, "content.publish");
  }
}

async function loadCourse(executor: Executor, courseId: string) {
  const [course] = await executor
    .select({ id: courses.id, slug: courses.slug, title: courses.title, status: courses.status })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)));
  if (!course) throw new AppError("NOT_FOUND");
  return course;
}

async function loadModule(executor: Executor, moduleId: string) {
  const [courseModule] = await executor
    .select()
    .from(courseModules)
    .where(and(eq(courseModules.id, moduleId), isNull(courseModules.deletedAt)));
  if (!courseModule) throw new AppError("NOT_FOUND");
  return courseModule;
}

async function loadLesson(executor: Executor, lessonId: string) {
  const [lesson] = await executor
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));
  if (!lesson) throw new AppError("NOT_FOUND");
  return lesson;
}

/** Latest upload per lesson that has not replaced the current video yet. */
async function pendingUploads(executor: Executor, lessonIds: string[]) {
  if (lessonIds.length === 0) return new Map<string, EditorLesson["pendingVideo"]>();
  const rows = await executor
    .select({
      assetId: mediaAssets.id,
      lessonId: mediaAssets.attachToLessonId,
      status: mediaAssets.status,
      failureReason: mediaAssets.failureReason,
    })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.attachToLessonId, lessonIds),
        inArray(mediaAssets.status, ["pending_upload", "processing", "failed"]),
        isNull(mediaAssets.deletedAt),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt));
  const map = new Map<string, EditorLesson["pendingVideo"]>();
  for (const row of rows) {
    if (row.lessonId && !map.has(row.lessonId)) {
      map.set(row.lessonId, {
        assetId: row.assetId,
        status: row.status,
        failureReason: row.failureReason,
      });
    }
  }
  return map;
}

export async function listEditableCourses(actor: Actor) {
  assertCan(actor, "content.read");
  return getDb()
    .select({ id: courses.id, slug: courses.slug, title: courses.title, status: courses.status })
    .from(courses)
    .where(isNull(courses.deletedAt))
    .orderBy(asc(courses.createdAt));
}

/** Every module and lesson of a course (any status) for the editor. */
export async function getEditorOutline(actor: Actor, courseId: string) {
  assertCan(actor, "content.read");
  const db = getDb();
  const course = await loadCourse(db, courseId);
  const [moduleRows, lessonRows, resourceCounts] = await Promise.all([
    db
      .select()
      .from(courseModules)
      .where(and(eq(courseModules.courseId, courseId), isNull(courseModules.deletedAt)))
      .orderBy(asc(courseModules.position), asc(courseModules.createdAt)),
    db
      .select({
        lesson: lessons,
        videoStatus: mediaAssets.status,
      })
      .from(lessons)
      .leftJoin(mediaAssets, eq(mediaAssets.id, lessons.videoAssetId))
      .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)))
      .orderBy(asc(lessons.position), asc(lessons.createdAt)),
    db
      .select({ lessonId: lessonResources.lessonId, value: count() })
      .from(lessonResources)
      .innerJoin(lessons, eq(lessons.id, lessonResources.lessonId))
      .where(eq(lessons.courseId, courseId))
      .groupBy(lessonResources.lessonId),
  ]);
  const pending = await pendingUploads(
    db,
    lessonRows.map((row) => row.lesson.id),
  );
  const resourcesByLesson = new Map(resourceCounts.map((row) => [row.lessonId, Number(row.value)]));

  const modules: EditorModule[] = moduleRows.map((courseModule) => ({
    id: courseModule.id,
    position: courseModule.position,
    title: courseModule.title,
    description: courseModule.description,
    status: courseModule.status,
    publishAt: courseModule.publishAt,
    lessons: lessonRows
      .filter((row) => row.lesson.moduleId === courseModule.id)
      .map(({ lesson, videoStatus }) => ({
        id: lesson.id,
        moduleId: lesson.moduleId,
        position: lesson.position,
        title: lesson.title,
        status: lesson.status,
        publishAt: lesson.publishAt,
        isFreePreview: lesson.isFreePreview,
        durationSeconds: lesson.durationSeconds,
        video:
          lesson.videoAssetId && videoStatus
            ? { assetId: lesson.videoAssetId, status: videoStatus }
            : null,
        pendingVideo: pending.get(lesson.id) ?? null,
        resourceCount: resourcesByLesson.get(lesson.id) ?? 0,
      })),
  }));
  return { course, modules };
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export async function createModule(
  actor: Actor,
  input: { courseId: string; title: LocalizedText; description?: LocalizedText | null },
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  return getDb().transaction(async (tx) => {
    await loadCourse(tx, input.courseId);
    const [last] = await tx
      .select({ value: sql<number>`coalesce(max(${courseModules.position}), 0)::int` })
      .from(courseModules)
      .where(and(eq(courseModules.courseId, input.courseId), isNull(courseModules.deletedAt)));
    const [courseModule] = await tx
      .insert(courseModules)
      .values({
        courseId: input.courseId,
        position: (last?.value ?? 0) + 1,
        title: input.title,
        description: input.description ?? null,
        status: "draft",
      })
      .returning();
    if (!courseModule) throw new Error("Failed to create module");
    await recordAudit(tx, {
      action: "content.module_created",
      actorUserId: actor.userId,
      targetType: "course_module",
      targetId: courseModule.id,
      meta,
    });
    return courseModule;
  });
}

export async function updateModule(
  actor: Actor,
  moduleId: string,
  input: { title?: LocalizedText; description?: LocalizedText | null } & Publication,
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  assertPublication(actor, input);
  return getDb().transaction(async (tx) => {
    const existing = await loadModule(tx, moduleId);
    const [courseModule] = await tx
      .update(courseModules)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.publishAt !== undefined ? { publishAt: input.publishAt } : {}),
      })
      .where(eq(courseModules.id, moduleId))
      .returning();
    const publicationChanged =
      (input.status !== undefined && input.status !== existing.status) ||
      (input.publishAt !== undefined &&
        (input.publishAt?.getTime() ?? null) !== (existing.publishAt?.getTime() ?? null));
    await recordAudit(tx, {
      action: publicationChanged ? "content.publication_changed" : "content.module_updated",
      actorUserId: actor.userId,
      targetType: "course_module",
      targetId: moduleId,
      meta,
      metadata: publicationChanged
        ? { from: existing.status, to: courseModule?.status, publishAt: courseModule?.publishAt }
        : undefined,
    });
    return courseModule;
  });
}

/** Soft-deletes a module and its lessons. */
export async function deleteModule(actor: Actor, moduleId: string, meta: RequestMeta) {
  assertCan(actor, "content.manage");
  await getDb().transaction(async (tx) => {
    const courseModule = await loadModule(tx, moduleId);
    if (courseModule.status === "published") assertCan(actor, "content.publish");
    const now = new Date();
    await tx
      .update(lessons)
      .set({ deletedAt: now })
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)));
    await tx.update(courseModules).set({ deletedAt: now }).where(eq(courseModules.id, moduleId));
    await recordAudit(tx, {
      action: "content.module_deleted",
      actorUserId: actor.userId,
      targetType: "course_module",
      targetId: moduleId,
      meta,
    });
  });
}

export async function reorderModules(
  actor: Actor,
  courseId: string,
  moduleIds: string[],
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  await getDb().transaction(async (tx) => {
    const current = await tx
      .select({ id: courseModules.id })
      .from(courseModules)
      .where(and(eq(courseModules.courseId, courseId), isNull(courseModules.deletedAt)))
      .for("update");
    const known = new Set(current.map((row) => row.id));
    if (
      moduleIds.length !== known.size ||
      new Set(moduleIds).size !== moduleIds.length ||
      !moduleIds.every((id) => known.has(id))
    ) {
      throw new AppError("INVALID_REQUEST", "The order must list every module exactly once");
    }
    for (const [index, id] of moduleIds.entries()) {
      await tx
        .update(courseModules)
        .set({ position: index + 1 })
        .where(eq(courseModules.id, id));
    }
    await recordAudit(tx, {
      action: "content.modules_reordered",
      actorUserId: actor.userId,
      targetType: "course",
      targetId: courseId,
      meta,
    });
  });
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

function slugFor(title: LocalizedText): string {
  const latin = (title.fr ?? title.en ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = randomToken(4)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x");
  return `${latin || "lesson"}-${suffix}`;
}

export async function createLesson(
  actor: Actor,
  input: { moduleId: string; title: LocalizedText },
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  return getDb().transaction(async (tx) => {
    const courseModule = await loadModule(tx, input.moduleId);
    const [last] = await tx
      .select({ value: sql<number>`coalesce(max(${lessons.position}), 0)::int` })
      .from(lessons)
      .where(and(eq(lessons.moduleId, input.moduleId), isNull(lessons.deletedAt)));
    const [lesson] = await tx
      .insert(lessons)
      .values({
        courseId: courseModule.courseId,
        moduleId: courseModule.id,
        position: (last?.value ?? 0) + 1,
        slug: slugFor(input.title),
        title: input.title,
        status: "draft",
      })
      .returning();
    if (!lesson) throw new Error("Failed to create lesson");
    await recordAudit(tx, {
      action: "content.lesson_created",
      actorUserId: actor.userId,
      targetType: "lesson",
      targetId: lesson.id,
      meta,
    });
    return lesson;
  });
}

/** Full lesson for the editor, with its video, pending upload and resources. */
export async function getEditorLesson(actor: Actor, lessonId: string) {
  assertCan(actor, "content.read");
  const db = getDb();
  const lesson = await loadLesson(db, lessonId);
  const [courseModule, video, resources, pending] = await Promise.all([
    loadModule(db, lesson.moduleId),
    lesson.videoAssetId
      ? db
          .select({
            id: mediaAssets.id,
            status: mediaAssets.status,
            durationSeconds: mediaAssets.durationSeconds,
            originalFilename: mediaAssets.originalFilename,
            provider: mediaAssets.provider,
            createdAt: mediaAssets.createdAt,
          })
          .from(mediaAssets)
          .where(eq(mediaAssets.id, lesson.videoAssetId))
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        id: lessonResources.id,
        kind: lessonResources.kind,
        title: lessonResources.title,
        url: lessonResources.url,
        position: lessonResources.position,
        assetId: lessonResources.assetId,
        filename: mediaAssets.originalFilename,
        sizeBytes: mediaAssets.sizeBytes,
        assetStatus: mediaAssets.status,
      })
      .from(lessonResources)
      .leftJoin(mediaAssets, eq(mediaAssets.id, lessonResources.assetId))
      .where(eq(lessonResources.lessonId, lessonId))
      .orderBy(asc(lessonResources.position), asc(lessonResources.createdAt)),
    pendingUploads(db, [lessonId]),
  ]);
  return {
    lesson,
    module: courseModule,
    video,
    resources,
    pendingVideo: pending.get(lessonId) ?? null,
  };
}

export async function updateLesson(
  actor: Actor,
  lessonId: string,
  input: {
    title?: LocalizedText;
    summary?: LocalizedText | null;
    body?: LocalizedText | null;
    isFreePreview?: boolean;
    completionThresholdPercent?: number;
    durationSeconds?: number | null;
  } & Publication,
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  assertPublication(actor, input);
  // A free preview is visible without purchase: a publication decision.
  if (input.isFreePreview !== undefined) assertCan(actor, "content.publish");
  return getDb().transaction(async (tx) => {
    const existing = await loadLesson(tx, lessonId);
    const patch: Partial<typeof lessons.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.summary !== undefined) patch.summary = input.summary;
    if (input.body !== undefined) patch.body = input.body;
    if (input.isFreePreview !== undefined) patch.isFreePreview = input.isFreePreview;
    if (input.completionThresholdPercent !== undefined) {
      patch.completionThresholdPercent = input.completionThresholdPercent;
    }
    // Duration is taken from the video once it exists; manual only for text lessons.
    if (input.durationSeconds !== undefined && !existing.videoAssetId) {
      patch.durationSeconds = input.durationSeconds;
    }
    if (input.status !== undefined) patch.status = input.status;
    if (input.publishAt !== undefined) patch.publishAt = input.publishAt;
    const [lesson] = await tx
      .update(lessons)
      .set(patch)
      .where(eq(lessons.id, lessonId))
      .returning();
    const publicationChanged =
      (input.status !== undefined && input.status !== existing.status) ||
      (input.publishAt !== undefined &&
        (input.publishAt?.getTime() ?? null) !== (existing.publishAt?.getTime() ?? null)) ||
      (input.isFreePreview !== undefined && input.isFreePreview !== existing.isFreePreview);
    await recordAudit(tx, {
      action: publicationChanged ? "content.publication_changed" : "content.lesson_updated",
      actorUserId: actor.userId,
      targetType: "lesson",
      targetId: lessonId,
      meta,
      metadata: publicationChanged
        ? {
            from: existing.status,
            to: lesson?.status,
            publishAt: lesson?.publishAt,
            isFreePreview: lesson?.isFreePreview,
          }
        : { fields: Object.keys(patch) },
    });
    return lesson;
  });
}

export async function deleteLesson(actor: Actor, lessonId: string, meta: RequestMeta) {
  assertCan(actor, "content.manage");
  await getDb().transaction(async (tx) => {
    const lesson = await loadLesson(tx, lessonId);
    if (lesson.status === "published") assertCan(actor, "content.publish");
    await tx.update(lessons).set({ deletedAt: new Date() }).where(eq(lessons.id, lessonId));
    await recordAudit(tx, {
      action: "content.lesson_deleted",
      actorUserId: actor.userId,
      targetType: "lesson",
      targetId: lessonId,
      meta,
    });
  });
}

/**
 * Sets the complete lesson order of a module. Lessons listed from another
 * module of the same course are moved into this one.
 */
export async function reorderLessons(
  actor: Actor,
  moduleId: string,
  lessonIds: string[],
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  await getDb().transaction(async (tx) => {
    const courseModule = await loadModule(tx, moduleId);
    if (new Set(lessonIds).size !== lessonIds.length) {
      throw new AppError("INVALID_REQUEST", "Duplicate lesson in order");
    }
    const listed =
      lessonIds.length === 0
        ? []
        : await tx
            .select({ id: lessons.id, moduleId: lessons.moduleId })
            .from(lessons)
            .where(
              and(
                inArray(lessons.id, lessonIds),
                eq(lessons.courseId, courseModule.courseId),
                isNull(lessons.deletedAt),
              ),
            )
            .for("update");
    if (listed.length !== lessonIds.length) {
      throw new AppError("INVALID_REQUEST", "Unknown lesson in order");
    }
    const current = await tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)));
    const listedIds = new Set(lessonIds);
    if (!current.every((row) => listedIds.has(row.id))) {
      throw new AppError("INVALID_REQUEST", "The order must keep every lesson of the module");
    }
    for (const [index, id] of lessonIds.entries()) {
      await tx
        .update(lessons)
        .set({ moduleId, position: index + 1 })
        .where(eq(lessons.id, id));
    }
    await recordAudit(tx, {
      action: "content.lessons_reordered",
      actorUserId: actor.userId,
      targetType: "course_module",
      targetId: moduleId,
      meta,
      metadata: {
        moved: listed.filter((row) => row.moduleId !== moduleId).map((row) => row.id),
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Resources (links here; files go through media.service)
// ---------------------------------------------------------------------------

async function nextResourcePosition(executor: Executor, lessonId: string) {
  const [last] = await executor
    .select({ value: sql<number>`coalesce(max(${lessonResources.position}), 0)::int` })
    .from(lessonResources)
    .where(eq(lessonResources.lessonId, lessonId));
  return (last?.value ?? 0) + 1;
}

export async function addResource(
  executor: Executor,
  actor: Actor,
  input:
    | { lessonId: string; kind: "link"; title: LocalizedText; url: string }
    | {
        lessonId: string;
        kind: Exclude<LessonResourceKind, "link">;
        title: LocalizedText;
        assetId: string;
      },
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  await loadLesson(executor, input.lessonId);
  const [resource] = await executor
    .insert(lessonResources)
    .values({
      lessonId: input.lessonId,
      kind: input.kind,
      title: input.title,
      url: input.kind === "link" ? input.url : null,
      assetId: input.kind === "link" ? null : input.assetId,
      position: await nextResourcePosition(executor, input.lessonId),
    })
    .returning();
  if (!resource) throw new Error("Failed to add resource");
  await recordAudit(executor, {
    action: "content.resource_added",
    actorUserId: actor.userId,
    targetType: "lesson",
    targetId: input.lessonId,
    meta,
    metadata: { resourceId: resource.id, kind: resource.kind },
  });
  return resource;
}

export async function addLinkResource(
  actor: Actor,
  input: { lessonId: string; title: LocalizedText; url: string },
  meta: RequestMeta,
) {
  return getDb().transaction((tx) => addResource(tx, actor, { ...input, kind: "link" }, meta));
}

export async function updateResource(
  actor: Actor,
  resourceId: string,
  input: { title?: LocalizedText; url?: string },
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(lessonResources)
      .where(eq(lessonResources.id, resourceId));
    if (!existing) throw new AppError("NOT_FOUND");
    if (input.url !== undefined && existing.kind !== "link") {
      throw new AppError("INVALID_REQUEST", "Only links have a URL");
    }
    const [resource] = await tx
      .update(lessonResources)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
      })
      .where(eq(lessonResources.id, resourceId))
      .returning();
    await recordAudit(tx, {
      action: "content.resource_updated",
      actorUserId: actor.userId,
      targetType: "lesson",
      targetId: existing.lessonId,
      meta,
      metadata: { resourceId },
    });
    return resource;
  });
}

/** Removes a resource; its file is deleted from storage by the caller (media.service). */
export async function deleteResource(actor: Actor, resourceId: string, meta: RequestMeta) {
  assertCan(actor, "content.manage");
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .delete(lessonResources)
      .where(eq(lessonResources.id, resourceId))
      .returning();
    if (!existing) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      action: "content.resource_deleted",
      actorUserId: actor.userId,
      targetType: "lesson",
      targetId: existing.lessonId,
      meta,
      metadata: { resourceId, kind: existing.kind },
    });
    return existing;
  });
}

export async function reorderResources(
  actor: Actor,
  lessonId: string,
  resourceIds: string[],
  meta: RequestMeta,
) {
  assertCan(actor, "content.manage");
  await getDb().transaction(async (tx) => {
    const current = await tx
      .select({ id: lessonResources.id })
      .from(lessonResources)
      .where(eq(lessonResources.lessonId, lessonId));
    const known = new Set(current.map((row) => row.id));
    if (
      resourceIds.length !== known.size ||
      new Set(resourceIds).size !== resourceIds.length ||
      !resourceIds.every((id) => known.has(id))
    ) {
      throw new AppError("INVALID_REQUEST", "The order must list every resource exactly once");
    }
    for (const [index, id] of resourceIds.entries()) {
      await tx
        .update(lessonResources)
        .set({ position: index + 1 })
        .where(eq(lessonResources.id, id));
    }
    await recordAudit(tx, {
      action: "content.resource_updated",
      actorUserId: actor.userId,
      targetType: "lesson",
      targetId: lessonId,
      meta,
      metadata: { reordered: true },
    });
  });
}
