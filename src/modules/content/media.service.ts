import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/server/db/client";
import { lessons, mediaAssets, type LocalizedText } from "@/server/db/schema";
import { isUuid, uuidv7 } from "@/server/db/uuid";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/http/errors";
import type { RequestMeta } from "@/server/http/request-meta";
import { logger } from "@/server/logger";
import { enforceRateLimit } from "@/server/rate-limit";
import { verifyUrlToken } from "@/server/signed-token";
import { getStorage, LocalStorage, requireStorage } from "@/server/storage";
import {
  getVideoProvider,
  requireVideoProvider,
  type VideoAssetUpdate,
  type VideoProviderName,
} from "@/server/video";
import { localVideoKey } from "@/server/video/local";
import type { LessonResourceKind, MediaKind, MediaStatus } from "@/shared/enums";
import { assertCan, type Actor } from "../access/actor";
import { recordAudit } from "../audit/audit.service";
import { addResource, deleteResource } from "./content.service";

const MB = 1024 * 1024;

/** Video containers the providers transcode (local development plays mp4/webm as is). */
const VIDEO_TYPE = /^video\/(mp4|webm|quicktime|x-matroska|x-msvideo|mpeg|x-m4v|3gpp)$/;

/** Downloadable resources. Never HTML/SVG/scripts (no stored XSS via downloads). */
const FILE_TYPES: Record<string, { kind: Exclude<LessonResourceKind, "link">; media: MediaKind }> =
  {
    "application/pdf": { kind: "pdf", media: "document" },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      kind: "spreadsheet",
      media: "document",
    },
    "application/vnd.ms-excel": { kind: "spreadsheet", media: "document" },
    "application/vnd.oasis.opendocument.spreadsheet": { kind: "spreadsheet", media: "document" },
    "text/csv": { kind: "spreadsheet", media: "document" },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      kind: "file",
      media: "document",
    },
    "application/msword": { kind: "file", media: "document" },
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
      kind: "file",
      media: "document",
    },
    "application/vnd.ms-powerpoint": { kind: "file", media: "document" },
    "application/zip": { kind: "file", media: "other" },
    "text/plain": { kind: "file", media: "document" },
    "image/png": { kind: "file", media: "image" },
    "image/jpeg": { kind: "file", media: "image" },
    "image/webp": { kind: "file", media: "image" },
  };

export function resourceKindFor(contentType: string) {
  return FILE_TYPES[contentType.toLowerCase()] ?? null;
}

function cleanFilename(filename: string): string {
  return (
    filename
      .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
      .trim()
      .slice(-180) || "file"
  );
}

async function loadAsset(executor: Executor, assetId: string, lock = false) {
  const query = executor
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), isNull(mediaAssets.deletedAt)));
  const [asset] = lock ? await query.for("update") : await query;
  if (!asset) throw new AppError("NOT_FOUND");
  return asset;
}

async function assertLessonExists(executor: Executor, lessonId: string) {
  const [lesson] = await executor
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));
  if (!lesson) throw new AppError("NOT_FOUND");
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

export async function startVideoUpload(
  actor: Actor,
  input: { lessonId: string; filename: string; sizeBytes: number; contentType: string },
  meta: RequestMeta,
) {
  assertCan(actor, "media.manage");
  await enforceRateLimit("media:upload:user", actor.userId);
  const provider = requireVideoProvider();
  const contentType = input.contentType.toLowerCase();
  if (!VIDEO_TYPE.test(contentType)) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  if (input.sizeBytes > getEnv().MAX_UPLOAD_VIDEO_MB * MB) throw new AppError("UPLOAD_TOO_LARGE");
  const db = getDb();
  await assertLessonExists(db, input.lessonId);

  const [asset] = await db
    .insert(mediaAssets)
    .values({
      kind: "video",
      provider: provider.name,
      status: "pending_upload",
      originalFilename: cleanFilename(input.filename),
      mimeType: contentType,
      sizeBytes: input.sizeBytes,
      uploadedBy: actor.userId,
      attachToLessonId: input.lessonId,
    })
    .returning();
  if (!asset) throw new Error("Failed to create media asset");

  let created;
  try {
    created = await provider.createUpload({
      assetId: asset.id,
      sizeBytes: input.sizeBytes,
      contentType,
      maxDurationSeconds: 6 * 3600,
    });
  } catch (error) {
    logger.error("video upload creation failed", { provider: provider.name, error });
    await db
      .update(mediaAssets)
      .set({ status: "failed", failureReason: "The upload could not be created" })
      .where(eq(mediaAssets.id, asset.id));
    throw new AppError("SERVICE_UNAVAILABLE");
  }
  await db
    .update(mediaAssets)
    .set({
      providerAssetId: created.providerAssetId ?? null,
      providerUploadId: created.providerUploadId ?? null,
      storageKey: provider.name === "local" ? localVideoKey(asset.id) : null,
    })
    .where(eq(mediaAssets.id, asset.id));
  await recordAudit(db, {
    action: "media.upload_started",
    actorUserId: actor.userId,
    targetType: "media_asset",
    targetId: asset.id,
    meta,
    metadata: { lessonId: input.lessonId, provider: provider.name, sizeBytes: input.sizeBytes },
  });
  return { assetId: asset.id, target: created.target };
}

const STATUS_RANK: Record<MediaStatus, number> = {
  pending_upload: 0,
  processing: 1,
  ready: 2,
  failed: 1,
  deleted: 3,
};

/**
 * Applies a provider update idempotently (webhooks may repeat or arrive out of
 * order): a ready video is never downgraded, and once ready it is attached to
 * its lesson in the same transaction.
 */
export async function applyVideoUpdate(
  assetId: string,
  update: VideoAssetUpdate,
  context: { actorUserId?: string | null; meta?: RequestMeta } = {},
) {
  if (update.status === "ready" && update.requiresProtection && update.providerAssetId) {
    // Never publish a video the provider would serve without a signed token.
    await requireVideoProvider().protectAsset(update.providerAssetId);
  }
  return getDb().transaction(async (tx) => {
    const asset = await loadAsset(tx, assetId, true);
    if (asset.status === "deleted") return asset;
    const downgrade =
      update.status !== "deleted" &&
      STATUS_RANK[update.status] < STATUS_RANK[asset.status] &&
      !(asset.status === "failed" && update.status === "processing");
    const keepStatus = downgrade || (asset.status === "ready" && update.status === "failed");
    const status = keepStatus ? asset.status : update.status;
    const [saved] = await tx
      .update(mediaAssets)
      .set({
        status,
        providerAssetId: update.providerAssetId ?? asset.providerAssetId,
        playbackId: update.playbackId ?? asset.playbackId,
        durationSeconds: update.durationSeconds ?? asset.durationSeconds,
        width: update.width ?? asset.width,
        height: update.height ?? asset.height,
        failureReason: status === "failed" ? (update.failureReason ?? "failed") : null,
        ...(status === "ready" ? { attachToLessonId: null } : {}),
      })
      .where(eq(mediaAssets.id, asset.id))
      .returning();

    if (status === "ready" && asset.status !== "ready" && asset.attachToLessonId) {
      await tx
        .update(lessons)
        .set({
          videoAssetId: asset.id,
          durationSeconds: sql`coalesce(${update.durationSeconds ?? asset.durationSeconds ?? null}::int, ${lessons.durationSeconds})`,
        })
        .where(and(eq(lessons.id, asset.attachToLessonId), isNull(lessons.deletedAt)));
    }
    if (status !== asset.status && (status === "ready" || status === "failed")) {
      await recordAudit(tx, {
        action: status === "ready" ? "media.ready" : "media.failed",
        actorUserId: context.actorUserId ?? null,
        targetType: "media_asset",
        targetId: asset.id,
        meta: context.meta,
        metadata: {
          lessonId: asset.attachToLessonId,
          ...(status === "failed" ? { reason: update.failureReason } : {}),
        },
      });
    }
    return saved ?? asset;
  });
}

const execFileAsync = promisify(execFile);

/** Duration via ffprobe when available (development provider only). */
async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { timeout: 15_000 },
    );
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
  } catch {
    return null;
  }
}

/** Reconciles a processing video with the provider (missed or delayed webhook). */
async function refreshFromProvider(asset: typeof mediaAssets.$inferSelect) {
  const provider = getVideoProvider();
  if (!provider || provider.name !== asset.provider) return asset;
  const update = await provider
    .fetchAsset({
      providerAssetId: asset.providerAssetId ?? undefined,
      providerUploadId: asset.providerUploadId ?? undefined,
    })
    .catch((error: unknown) => {
      logger.warn("video provider reconcile failed", { assetId: asset.id, error });
      return null;
    });
  return update ? applyVideoUpdate(asset.id, update) : asset;
}

function publicAsset(asset: typeof mediaAssets.$inferSelect) {
  return {
    id: asset.id,
    kind: asset.kind,
    status: asset.status,
    failureReason: asset.failureReason,
    durationSeconds: asset.durationSeconds,
    originalFilename: asset.originalFilename,
  };
}

/**
 * Called by the browser when its upload finished. Files are verified (size)
 * and become lesson resources; local videos are probed and attached; provider
 * videos keep processing (webhook or a reconcile finishes them).
 */
export async function completeUpload(
  actor: Actor,
  assetId: string,
  input: { durationSeconds?: number },
  meta: RequestMeta,
) {
  assertCan(actor, "media.manage");
  const db = getDb();
  const asset = await loadAsset(db, assetId);
  if (asset.uploadedBy !== actor.userId) assertCan(actor, "content.publish");

  if (asset.kind === "video") {
    if (asset.provider === "local") {
      const storage = new LocalStorage(getEnv().LOCAL_STORAGE_DIR);
      const key = asset.storageKey ?? localVideoKey(asset.id);
      const info = await storage.head(key);
      if (!info || info.sizeBytes !== asset.sizeBytes) {
        throw new AppError("INVALID_STATE", "The upload is incomplete");
      }
      const duration =
        (await probeDuration(storage.resolve(key))) ??
        (input.durationSeconds ? Math.round(input.durationSeconds) : undefined);
      return publicAsset(
        await applyVideoUpdate(
          asset.id,
          { status: "ready", providerAssetId: key, playbackId: key, durationSeconds: duration },
          { actorUserId: actor.userId, meta },
        ),
      );
    }
    if (asset.status === "pending_upload") {
      await db
        .update(mediaAssets)
        .set({ status: "processing" })
        .where(and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, "pending_upload")));
    }
    return publicAsset(await refreshFromProvider(await loadAsset(db, asset.id)));
  }

  // File resource
  if (asset.status === "ready") return publicAsset(asset);
  const storage = requireStorage();
  if (!asset.storageKey || !asset.attachToLessonId) throw new AppError("INVALID_STATE");
  const info = await storage.head(asset.storageKey);
  if (!info) throw new AppError("INVALID_STATE", "The upload is incomplete");
  if (info.sizeBytes !== asset.sizeBytes) {
    await storage.delete(asset.storageKey);
    await db
      .update(mediaAssets)
      .set({ status: "failed", failureReason: "Size mismatch" })
      .where(eq(mediaAssets.id, asset.id));
    throw new AppError("INVALID_REQUEST", "Uploaded size does not match");
  }
  const fileType = resourceKindFor(asset.mimeType ?? "");
  if (!fileType) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  const title = (asset.metadata.resourceTitle as LocalizedText | undefined) ?? {
    ar: asset.originalFilename ?? "",
  };
  const lessonId = asset.attachToLessonId;
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(mediaAssets)
      .set({ status: "ready", attachToLessonId: null })
      .where(and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, "pending_upload")))
      .returning();
    if (!row) return loadAsset(tx, asset.id);
    await addResource(tx, actor, { lessonId, kind: fileType.kind, title, assetId: asset.id }, meta);
    await recordAudit(tx, {
      action: "media.ready",
      actorUserId: actor.userId,
      targetType: "media_asset",
      targetId: asset.id,
      meta,
      metadata: { lessonId },
    });
    return row;
  });
  return publicAsset(saved);
}

/** Status for the editor; reconciles with the provider at most every 10 seconds. */
export async function getMediaStatus(actor: Actor, assetId: string) {
  assertCan(actor, "media.manage");
  const db = getDb();
  const asset = await loadAsset(db, assetId);
  const stale = Date.now() - asset.updatedAt.getTime() > 10_000;
  if (
    asset.kind === "video" &&
    asset.provider !== "local" &&
    (asset.status === "processing" || asset.status === "pending_upload") &&
    stale
  ) {
    // Touch first so concurrent pollers do not all call the provider.
    await db.update(mediaAssets).set({ updatedAt: new Date() }).where(eq(mediaAssets.id, asset.id));
    return publicAsset(await refreshFromProvider(asset));
  }
  return publicAsset(asset);
}

/** Verified provider webhook → asset update. Unknown assets are acknowledged and ignored. */
export async function handleVideoWebhook(
  providerName: VideoProviderName,
  rawBody: string,
  headers: Headers,
) {
  const provider = getVideoProvider();
  if (!provider || provider.name !== providerName) throw new AppError("NOT_FOUND");
  const event = provider.parseWebhook(rawBody, headers);
  if (event.kind === "ignored") return { handled: false, type: event.type };
  const db = getDb();
  let asset: { id: string } | undefined;
  if (isUuid(event.match.assetId)) {
    [asset] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, event.match.assetId), eq(mediaAssets.provider, providerName)));
  }
  if (!asset && event.match.providerAssetId) {
    [asset] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.provider, providerName),
          eq(mediaAssets.providerAssetId, event.match.providerAssetId),
        ),
      );
  }
  if (!asset) {
    logger.warn("video webhook for an unknown asset", { provider: providerName, type: event.type });
    return { handled: false, type: event.type };
  }
  await applyVideoUpdate(asset.id, event.update);
  return { handled: true, type: event.type };
}

export async function detachLessonVideo(actor: Actor, lessonId: string, meta: RequestMeta) {
  assertCan(actor, "media.manage");
  assertCan(actor, "content.publish");
  await getDb().transaction(async (tx) => {
    const [lesson] = await tx
      .update(lessons)
      .set({ videoAssetId: null })
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)))
      .returning({ id: lessons.id });
    if (!lesson) throw new AppError("NOT_FOUND");
    await recordAudit(tx, {
      action: "media.video_detached",
      actorUserId: actor.userId,
      targetType: "lesson",
      targetId: lessonId,
      meta,
    });
  });
}

// ---------------------------------------------------------------------------
// Files (lesson resources)
// ---------------------------------------------------------------------------

export async function startFileUpload(
  actor: Actor,
  input: {
    lessonId: string;
    filename: string;
    sizeBytes: number;
    contentType: string;
    title: LocalizedText;
  },
  meta: RequestMeta,
) {
  assertCan(actor, "media.manage");
  assertCan(actor, "content.manage");
  await enforceRateLimit("media:upload:user", actor.userId);
  const storage = requireStorage();
  const contentType = input.contentType.toLowerCase();
  const fileType = resourceKindFor(contentType);
  if (!fileType) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  if (input.sizeBytes > getEnv().MAX_UPLOAD_FILE_MB * MB) throw new AppError("UPLOAD_TOO_LARGE");
  const db = getDb();
  await assertLessonExists(db, input.lessonId);
  const id = uuidv7();
  const key = `files/${id}`;
  await db.insert(mediaAssets).values({
    id,
    kind: fileType.media,
    provider: storage.name === "s3" ? "s3" : "local",
    status: "pending_upload",
    storageKey: key,
    originalFilename: cleanFilename(input.filename),
    mimeType: contentType,
    sizeBytes: input.sizeBytes,
    uploadedBy: actor.userId,
    attachToLessonId: input.lessonId,
    metadata: { resourceTitle: input.title },
  });
  const target = await storage.createUpload({
    key,
    contentType,
    sizeBytes: input.sizeBytes,
  });
  await recordAudit(db, {
    action: "media.upload_started",
    actorUserId: actor.userId,
    targetType: "media_asset",
    targetId: id,
    meta,
    metadata: { lessonId: input.lessonId, provider: storage.name, sizeBytes: input.sizeBytes },
  });
  return { assetId: id, target };
}

/** Deletes a resource and, for files, the stored object. */
export async function removeResource(actor: Actor, resourceId: string, meta: RequestMeta) {
  const removed = await deleteResource(actor, resourceId, meta);
  if (removed.assetId) {
    const db = getDb();
    const [asset] = await db
      .update(mediaAssets)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(mediaAssets.id, removed.assetId))
      .returning();
    const storage = getStorage();
    if (asset?.storageKey && storage) {
      await storage.delete(asset.storageKey).catch((error: unknown) => {
        logger.warn("stored file could not be deleted", { assetId: asset.id, error });
      });
    }
  }
}

/**
 * Local development uploads (our API plays the role of a presigned URL): the
 * token pins key, type and exact size; the caller must also hold media.manage.
 */
export async function writeLocalUpload(
  actor: Actor,
  token: string,
  contentType: string | null,
  body: ReadableStream<Uint8Array> | null,
) {
  assertCan(actor, "media.manage");
  const env = getEnv();
  if (env.VIDEO_PROVIDER !== "local" && env.STORAGE_PROVIDER !== "local") {
    throw new AppError("NOT_FOUND");
  }
  const data = verifyUrlToken<{ key: string; contentType: string; sizeBytes: number }>(
    "local-upload",
    token,
  );
  if (!data) throw new AppError("FORBIDDEN", "Invalid or expired upload URL");
  if ((contentType ?? "").toLowerCase() !== data.contentType) {
    throw new AppError("INVALID_REQUEST", "Content-Type does not match the upload");
  }
  if (!body) throw new AppError("INVALID_REQUEST", "Empty body");
  const storage = new LocalStorage(env.LOCAL_STORAGE_DIR);
  return storage.writeObject(data.key, body, {
    contentType: data.contentType,
    expectedBytes: data.sizeBytes,
  });
}

export async function checkMediaProviders(actor: Actor) {
  assertCan(actor, "media.manage");
  const video = getVideoProvider();
  const storage = getStorage();
  const [videoCheck, storageCheck] = await Promise.all([
    video?.checkConnection() ?? null,
    storage?.checkConnection() ?? null,
  ]);
  return {
    video: video ? { provider: video.name, ...videoCheck } : null,
    storage: storage ? { provider: storage.name, ...storageCheck } : null,
  };
}
