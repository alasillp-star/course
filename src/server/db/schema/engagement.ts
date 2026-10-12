import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AVAILABILITY_STATUSES,
  BOOKING_STATUSES,
  EMAIL_DELIVERY_STATUSES,
  LIVE_SESSION_KINDS,
  LIVE_SESSION_STATUSES,
  MEETING_PROVIDERS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "../../../shared/enums";
import { createdAt, deletedAt, enumCheck, pk, rule, tstz, updatedAt } from "./_columns";
import { courses, mediaAssets } from "./catalog";
import { users } from "./identity";

// Notifications -----------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** e.g. community.reply, community.mention, live.reminder, assignment.graded */
    type: text().notNull(),
    /** Template parameters; the UI renders localized text from type + data. */
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    link: text(),
    readAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_feed_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    inApp: boolean().notNull().default(true),
    email: boolean().notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

/** Delivery log for transactional e-mails (never stores message bodies or codes). */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: pk(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    toEmail: text().notNull(),
    template: text().notNull(),
    locale: text().notNull(),
    transport: text().notNull(),
    status: text({ enum: EMAIL_DELIVERY_STATUSES }).notNull(),
    providerMessageId: text(),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("email_deliveries_status_check", t.status, EMAIL_DELIVERY_STATUSES),
    index("email_deliveries_to_idx").on(t.toEmail, t.createdAt),
    index("email_deliveries_created_idx").on(t.createdAt),
  ],
);

// Live sessions & coaching ------------------------------------------------------

/**
 * Scheduled live sessions. The meeting provider is abstracted (provider +
 * provider_meeting_id); the join URL is encrypted at rest and only returned to
 * users holding a booking or a staff permission.
 */
export const liveSessions = pgTable(
  "live_sessions",
  {
    id: pk(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    kind: text({ enum: LIVE_SESSION_KINDS }).notNull().default("group"),
    title: text().notNull(),
    description: text(),
    hostUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    /** NULL = unlimited seats. */
    capacity: integer(),
    provider: text({ enum: MEETING_PROVIDERS }).notNull().default("custom"),
    providerMeetingId: text(),
    joinUrlCiphertext: text(),
    status: text({ enum: LIVE_SESSION_STATUSES }).notNull().default("scheduled"),
    recordingAssetId: uuid().references(() => mediaAssets.id, { onDelete: "set null" }),
    /** Replay hosted elsewhere (e.g. an unlisted YouTube video), encrypted like the join URL. */
    recordingUrlCiphertext: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    enumCheck("live_sessions_kind_check", t.kind, LIVE_SESSION_KINDS),
    enumCheck("live_sessions_status_check", t.status, LIVE_SESSION_STATUSES),
    enumCheck("live_sessions_provider_check", t.provider, MEETING_PROVIDERS),
    rule("live_sessions_period_check", sql`${t.endsAt} > ${t.startsAt}`),
    rule("live_sessions_capacity_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
    index("live_sessions_schedule_idx").on(t.courseId, t.startsAt),
  ],
);

export const sessionBookings = pgTable(
  "session_bookings",
  {
    id: pk(),
    sessionId: uuid()
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text({ enum: BOOKING_STATUSES }).notNull().default("booked"),
    bookedAt: tstz().notNull().defaultNow(),
    cancelledAt: tstz(),
    reminderSentAt: tstz(),
  },
  (t) => [
    enumCheck("session_bookings_status_check", t.status, BOOKING_STATUSES),
    uniqueIndex("session_bookings_session_user_key").on(t.sessionId, t.userId),
    index("session_bookings_user_idx").on(t.userId),
  ],
);

/** Coach availability slots for 1-on-1 sessions. */
export const coachAvailability = pgTable(
  "coach_availability",
  {
    id: pk(),
    coachUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    status: text({ enum: AVAILABILITY_STATUSES }).notNull().default("open"),
    sessionId: uuid().references(() => liveSessions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    enumCheck("coach_availability_status_check", t.status, AVAILABILITY_STATUSES),
    rule("coach_availability_period_check", sql`${t.endsAt} > ${t.startsAt}`),
    index("coach_availability_coach_idx").on(t.coachUserId, t.startsAt),
  ],
);

// Support -------------------------------------------------------------------------

export const ticketNumberSeq = pgSequence("ticket_number_seq", { startWith: 1000 });

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: pk(),
    ticketNumber: text().notNull(),
    requesterId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** For requests from people who cannot sign in (lost e-mail access). */
    requesterEmail: text(),
    category: text({ enum: TICKET_CATEGORIES }).notNull(),
    status: text({ enum: TICKET_STATUSES }).notNull().default("open"),
    priority: text({ enum: TICKET_PRIORITIES }).notNull().default("normal"),
    subject: text().notNull(),
    assigneeId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: tstz(),
    closedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("support_tickets_number_key").on(t.ticketNumber),
    enumCheck("support_tickets_category_check", t.category, TICKET_CATEGORIES),
    enumCheck("support_tickets_status_check", t.status, TICKET_STATUSES),
    enumCheck("support_tickets_priority_check", t.priority, TICKET_PRIORITIES),
    rule(
      "support_tickets_requester_check",
      sql`${t.requesterId} is not null or ${t.requesterEmail} is not null`,
    ),
    index("support_tickets_queue_idx").on(t.status, t.priority, t.createdAt),
    index("support_tickets_requester_idx").on(t.requesterId),
  ],
);

export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: pk(),
    ticketId: uuid()
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    body: text().notNull(),
    /** Internal notes are visible to staff only. */
    isInternal: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("support_ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);
