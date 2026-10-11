import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  CONTENT_STATUSES,
  COURSE_STATUSES,
  LESSON_RESOURCE_KINDS,
  MEDIA_KINDS,
  MEDIA_PROVIDERS,
  MEDIA_STATUSES,
  TEXT_TRACK_KINDS,
} from "../../../shared/enums";
import { LOCALES } from "../../../i18n/config";
import {
  createdAt,
  deletedAt,
  enumCheck,
  localized,
  pk,
  rule,
  tsvector,
  tstz,
  updatedAt,
} from "./_columns";
import { users } from "./identity";

/**
 * Courses. The academy launches with one flagship course, but every
 * course-scoped table carries course_id so additional courses, bundles and
 * membership plans can be added without restructuring.
 */
export const courses = pgTable(
  "courses",
  {
    id: pk(),
    slug: text().notNull(),
    title: localized().notNull(),
    subtitle: localized(),
    description: localized(),
    coverImageUrl: text(),
    status: text({ enum: COURSE_STATUSES }).notNull().default("draft"),
    defaultLocale: text({ enum: LOCALES }).notNull().default("ar"),
    /** Display price (minor units); actual prices live on orders. */
    listPriceMinor: bigint({ mode: "number" }),
    currency: text().notNull().default("DZD"),
    publishedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("courses_slug_key").on(t.slug),
    enumCheck("courses_status_check", t.status, COURSE_STATUSES),
    rule("courses_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/** Media library: videos (Mux / Cloudflare Stream) and files (object storage). */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: pk(),
    kind: text({ enum: MEDIA_KINDS }).notNull(),
    provider: text({ enum: MEDIA_PROVIDERS }).notNull(),
    /** Provider-side identifiers; never exposed to students directly. */
    providerAssetId: text(),
    playbackId: text(),
    storageKey: text(),
    originalFilename: text(),
    mimeType: text(),
    sizeBytes: bigint({ mode: "number" }),
    durationSeconds: integer(),
    width: integer(),
    height: integer(),
    checksumSha256: text(),
    status: text({ enum: MEDIA_STATUSES }).notNull().default("pending_upload"),
    failureReason: text(),
    uploadedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("media_assets_kind_check", t.kind, MEDIA_KINDS),
    enumCheck("media_assets_provider_check", t.provider, MEDIA_PROVIDERS),
    enumCheck("media_assets_status_check", t.status, MEDIA_STATUSES),
    uniqueIndex("media_assets_provider_asset_key")
      .on(t.provider, t.providerAssetId)
      .where(sql`${t.providerAssetId} is not null`),
    index("media_assets_kind_idx").on(t.kind, t.createdAt),
  ],
);

export const courseModules = pgTable(
  "course_modules",
  {
    id: pk(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    title: localized().notNull(),
    description: localized(),
    status: text({ enum: CONTENT_STATUSES }).notNull().default("draft"),
    /** Scheduled publication: visible to students once now() >= publish_at. */
    publishAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("course_modules_status_check", t.status, CONTENT_STATUSES),
    index("course_modules_course_position_idx").on(t.courseId, t.position),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: pk(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: uuid()
      .notNull()
      .references(() => courseModules.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    slug: text().notNull(),
    title: localized().notNull(),
    summary: localized(),
    /** Rich-text body (sanitised HTML per locale). */
    body: localized(),
    videoAssetId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
    durationSeconds: integer(),
    /** Free preview lessons are visible on the public curriculum page. */
    isFreePreview: boolean().notNull().default(false),
    /** Share of the video that must be watched for the lesson to count as viewed. */
    completionThresholdPercent: integer().notNull().default(90),
    status: text({ enum: CONTENT_STATUSES }).notNull().default("draft"),
    publishAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("lessons_status_check", t.status, CONTENT_STATUSES),
    rule(
      "lessons_completion_threshold_check",
      sql`${t.completionThresholdPercent} between 1 and 100`,
    ),
    uniqueIndex("lessons_course_slug_key")
      .on(t.courseId, t.slug)
      .where(sql`${t.deletedAt} is null`),
    index("lessons_module_position_idx").on(t.moduleId, t.position),
    index("lessons_course_idx").on(t.courseId),
  ],
);

export const lessonResources = pgTable(
  "lesson_resources",
  {
    id: pk(),
    lessonId: uuid()
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    kind: text({ enum: LESSON_RESOURCE_KINDS }).notNull(),
    title: localized().notNull(),
    url: text(),
    assetId: uuid().references(() => mediaAssets.id, { onDelete: "restrict" }),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    enumCheck("lesson_resources_kind_check", t.kind, LESSON_RESOURCE_KINDS),
    rule(
      "lesson_resources_target_check",
      sql`(${t.kind} = 'link' and ${t.url} is not null) or (${t.kind} <> 'link' and ${t.assetId} is not null)`,
    ),
    index("lesson_resources_lesson_idx").on(t.lessonId, t.position),
  ],
);

/** Subtitle / caption tracks attached to a video asset. */
export const videoTextTracks = pgTable(
  "video_text_tracks",
  {
    id: pk(),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    locale: text({ enum: LOCALES }).notNull(),
    kind: text({ enum: TEXT_TRACK_KINDS }).notNull().default("subtitles"),
    label: text().notNull(),
    providerTrackId: text(),
    storageKey: text(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("video_text_tracks_kind_check", t.kind, TEXT_TRACK_KINDS),
    uniqueIndex("video_text_tracks_asset_locale_kind_key").on(t.assetId, t.locale, t.kind),
  ],
);

/** Time-coded transcript used for in-player search and (later) the AI assistant. */
export const videoTranscripts = pgTable(
  "video_transcripts",
  {
    id: pk(),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    locale: text({ enum: LOCALES }).notNull(),
    segments: jsonb()
      .$type<Array<{ start: number; end: number; text: string }>>()
      .notNull()
      .default([]),
    fullText: text().notNull().default(""),
    searchVector: tsvector().generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(full_text, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("video_transcripts_asset_locale_key").on(t.assetId, t.locale),
    index("video_transcripts_search_idx").using("gin", t.searchVector),
  ],
);
