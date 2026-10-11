import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  COMMUNITY_SPACE_KEYS,
  POSTING_POLICIES,
  REACTION_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  UGC_STATUSES,
} from "../../../shared/enums";
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
import { courses, lessons, mediaAssets } from "./catalog";
import { users } from "./identity";

/**
 * One community shared by every student entitled to the course, organised in
 * spaces (General, Q&A, Success stories, ...). Membership is not stored: it is
 * derived from an active course entitlement, so revoking access also removes
 * community access.
 */
export const communitySpaces = pgTable(
  "community_spaces",
  {
    id: pk(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    key: text({ enum: COMMUNITY_SPACE_KEYS }).notNull(),
    name: localized().notNull(),
    description: localized(),
    position: integer().notNull().default(0),
    postingPolicy: text({ enum: POSTING_POLICIES }).notNull().default("members"),
    allowsVerifiedAnswers: boolean().notNull().default(false),
    isArchived: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("community_spaces_course_key_key").on(t.courseId, t.key),
    enumCheck("community_spaces_key_check", t.key, COMMUNITY_SPACE_KEYS),
    enumCheck("community_spaces_posting_policy_check", t.postingPolicy, POSTING_POLICIES),
  ],
);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: pk(),
    spaceId: uuid()
      .notNull()
      .references(() => communitySpaces.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Optional link to the lesson a question is about. */
    lessonId: uuid().references(() => lessons.id, { onDelete: "set null" }),
    title: text(),
    /** Markdown source; rendered through a sanitiser, never as raw HTML. */
    body: text().notNull(),
    status: text({ enum: UGC_STATUSES }).notNull().default("published"),
    pinnedAt: tstz(),
    pinnedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reactionCount: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),
    lastActivityAt: tstz().notNull().defaultNow(),
    editedAt: tstz(),
    moderatedAt: tstz(),
    moderatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    moderationReason: text(),
    searchVector: tsvector().generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title, '') || ' ' || body)`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("community_posts_status_check", t.status, UGC_STATUSES),
    rule("community_posts_body_length_check", sql`char_length(${t.body}) between 1 and 20000`),
    rule("community_posts_counts_check", sql`${t.reactionCount} >= 0 and ${t.commentCount} >= 0`),
    index("community_posts_feed_idx").on(t.spaceId, t.status, t.lastActivityAt),
    index("community_posts_pinned_idx")
      .on(t.spaceId, t.pinnedAt)
      .where(sql`${t.pinnedAt} is not null`),
    index("community_posts_author_idx").on(t.authorId, t.createdAt),
    index("community_posts_lesson_idx").on(t.lessonId),
    index("community_posts_search_idx").using("gin", t.searchVector),
  ],
);

export const postAttachments = pgTable(
  "post_attachments",
  {
    id: pk(),
    postId: uuid()
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("post_attachments_post_idx").on(t.postId, t.position)],
);

export const postComments = pgTable(
  "post_comments",
  {
    id: pk(),
    postId: uuid()
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    /** Replies reference their parent comment (one nesting level in the UI). */
    parentCommentId: uuid().references((): AnyPgColumn => postComments.id, {
      onDelete: "cascade",
    }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    status: text({ enum: UGC_STATUSES }).notNull().default("published"),
    isVerifiedAnswer: boolean().notNull().default(false),
    verifiedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: tstz(),
    reactionCount: integer().notNull().default(0),
    editedAt: tstz(),
    moderatedAt: tstz(),
    moderatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("post_comments_status_check", t.status, UGC_STATUSES),
    rule("post_comments_body_length_check", sql`char_length(${t.body}) between 1 and 10000`),
    rule(
      "post_comments_verified_check",
      sql`${t.isVerifiedAnswer} = (${t.verifiedAt} is not null)`,
    ),
    uniqueIndex("post_comments_one_verified_key")
      .on(t.postId)
      .where(sql`${t.isVerifiedAnswer}`),
    index("post_comments_post_idx").on(t.postId, t.createdAt),
    index("post_comments_author_idx").on(t.authorId),
  ],
);

export const postReactions = pgTable(
  "post_reactions",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid().references(() => communityPosts.id, { onDelete: "cascade" }),
    commentId: uuid().references(() => postComments.id, { onDelete: "cascade" }),
    type: text({ enum: REACTION_TYPES }).notNull().default("like"),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("post_reactions_type_check", t.type, REACTION_TYPES),
    rule("post_reactions_target_check", sql`num_nonnulls(${t.postId}, ${t.commentId}) = 1`),
    uniqueIndex("post_reactions_user_post_key")
      .on(t.userId, t.postId)
      .where(sql`${t.postId} is not null`),
    uniqueIndex("post_reactions_user_comment_key")
      .on(t.userId, t.commentId)
      .where(sql`${t.commentId} is not null`),
    index("post_reactions_post_idx").on(t.postId),
    index("post_reactions_comment_idx").on(t.commentId),
  ],
);

export const postMentions = pgTable(
  "post_mentions",
  {
    id: pk(),
    postId: uuid().references(() => communityPosts.id, { onDelete: "cascade" }),
    commentId: uuid().references(() => postComments.id, { onDelete: "cascade" }),
    mentionedUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    rule("post_mentions_target_check", sql`num_nonnulls(${t.postId}, ${t.commentId}) = 1`),
    index("post_mentions_user_idx").on(t.mentionedUserId, t.createdAt),
  ],
);

export const communityTags = pgTable(
  "community_tags",
  {
    id: pk(),
    slug: text().notNull(),
    label: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("community_tags_slug_key").on(t.slug),
    rule("community_tags_slug_check", sql`${t.slug} ~ '^[a-z0-9\\u0600-\\u06ff_-]{1,50}$'`),
  ],
);

export const postTags = pgTable(
  "post_tags",
  {
    postId: uuid()
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => communityTags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] }), index("post_tags_tag_idx").on(t.tagId)],
);

export const postReports = pgTable(
  "post_reports",
  {
    id: pk(),
    reporterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid().references(() => communityPosts.id, { onDelete: "cascade" }),
    commentId: uuid().references(() => postComments.id, { onDelete: "cascade" }),
    reason: text({ enum: REPORT_REASONS }).notNull(),
    details: text(),
    status: text({ enum: REPORT_STATUSES }).notNull().default("open"),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: tstz(),
    resolutionNote: text(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("post_reports_reason_check", t.reason, REPORT_REASONS),
    enumCheck("post_reports_status_check", t.status, REPORT_STATUSES),
    rule("post_reports_target_check", sql`num_nonnulls(${t.postId}, ${t.commentId}) = 1`),
    uniqueIndex("post_reports_reporter_post_key")
      .on(t.reporterId, t.postId)
      .where(sql`${t.postId} is not null`),
    uniqueIndex("post_reports_reporter_comment_key")
      .on(t.reporterId, t.commentId)
      .where(sql`${t.commentId} is not null`),
    index("post_reports_queue_idx").on(t.status, t.createdAt),
  ],
);

export const communityBans = pgTable(
  "community_bans",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bannedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text().notNull(),
    startsAt: tstz().notNull().defaultNow(),
    /** NULL = permanent until lifted. */
    expiresAt: tstz(),
    liftedAt: tstz(),
    liftedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("community_bans_user_idx").on(t.userId, t.startsAt)],
);
