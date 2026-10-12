/**
 * Domain enumerations shared by the database schema, server services and UI.
 * Pure module (no server-only imports). Values are stored as text with CHECK
 * constraints rather than Postgres enum types so they can evolve with plain
 * migrations.
 */

// Identity -------------------------------------------------------------------
export const USER_STATUSES = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const OTP_PURPOSES = [
  "login",
  "activation",
  "email_change",
  /** Second sign-in step for staff without an authenticator app: a code e-mailed to them. */
  "staff_verification",
] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const SESSION_CLIENT_TYPES = ["web", "mobile"] as const;
export type SessionClientType = (typeof SESSION_CLIENT_TYPES)[number];

export const MFA_FACTOR_TYPES = ["totp"] as const;
export type MfaFactorType = (typeof MFA_FACTOR_TYPES)[number];

// Access control ---------------------------------------------------------------
export const SYSTEM_ROLES = [
  "super_admin",
  "admin",
  "instructor",
  "moderator",
  "support_agent",
  "sales_agent",
  /** Prints personalised activation cards from the print queue; sees nothing else. */
  "print_operator",
  "student",
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Roles that grant access to the administration area (and require MFA). */
export const STAFF_ROLES: readonly SystemRole[] = [
  "super_admin",
  "admin",
  "instructor",
  "moderator",
  "support_agent",
  "sales_agent",
  "print_operator",
];

// Catalog / content -----------------------------------------------------------
export const COURSE_STATUSES = ["draft", "published", "archived"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const CONTENT_STATUSES = ["draft", "published", "hidden"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const LESSON_RESOURCE_KINDS = ["pdf", "spreadsheet", "link", "file"] as const;
export type LessonResourceKind = (typeof LESSON_RESOURCE_KINDS)[number];

export const MEDIA_KINDS = ["video", "document", "image", "audio", "other"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_PROVIDERS = [
  "mux",
  "cloudflare_stream",
  "s3",
  "supabase_storage",
  "external",
  /** Development / test only (refused in staging and production). */
  "local",
] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

export const MEDIA_STATUSES = [
  "pending_upload",
  "processing",
  "ready",
  "failed",
  "deleted",
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const TEXT_TRACK_KINDS = ["subtitles", "captions"] as const;

// Learning ----------------------------------------------------------------------
export const LESSON_PROGRESS_STATUSES = ["in_progress", "completed"] as const;
export type LessonProgressStatus = (typeof LESSON_PROGRESS_STATUSES)[number];

// Assessments -------------------------------------------------------------------
export const QUIZ_QUESTION_TYPES = ["single_choice", "multiple_choice", "true_false"] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export const SUBMISSION_STATUSES = [
  "submitted",
  "under_review",
  "needs_revision",
  "approved",
  "rejected",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

// Activation (QR cards) -----------------------------------------------------------
export const ACTIVATION_CODE_STATUSES = ["available", "sold", "activated", "revoked"] as const;
export type ActivationCodeStatus = (typeof ACTIVATION_CODE_STATUSES)[number];

/** blank: cards without a name; personalized: one card per confirmed order, with the recipient's name. */
export const CARD_PRINT_KINDS = ["blank", "personalized"] as const;
export type CardPrintKind = (typeof CARD_PRINT_KINDS)[number];

/** a4_sheet: 10 cards per A4 page with crop marks; single_card: one 85.6 x 54 mm page per card (card printers). */
export const CARD_PRINT_LAYOUTS = ["a4_sheet", "single_card"] as const;
export type CardPrintLayout = (typeof CARD_PRINT_LAYOUTS)[number];

export const ACTIVATION_BATCH_STATUSES = ["active", "archived"] as const;
export type ActivationBatchStatus = (typeof ACTIVATION_BATCH_STATUSES)[number];

export const ACTIVATION_EVENT_TYPES = [
  "batch_created",
  "batch_exported",
  "batch_secrets_purged",
  "code_sold",
  "code_unsold",
  /** Card packed in a customer's parcel: redeemable once the carrier reports delivery. */
  "code_assigned",
  "code_unassigned",
  "code_activated",
  "code_revoked",
  "code_replaced",
  "code_locked",
  "code_unlocked",
  "pin_failed",
  "redemption_rejected",
  /** A card was printed (again): blank, or personalised with an order recipient's name. */
  "code_printed",
] as const;
export type ActivationEventType = (typeof ACTIVATION_EVENT_TYPES)[number];

// Entitlements ----------------------------------------------------------------------
export const ENTITLEMENT_STATUSES = ["active", "revoked"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export const ENTITLEMENT_SOURCES = [
  "activation_code",
  "order",
  "manual_grant",
  "subscription",
  "migration",
] as const;
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

// Commerce ----------------------------------------------------------------------------
export const ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "paid",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_CHANNELS = ["in_person", "reseller", "phone", "online"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

/**
 * How an order was confirmed with the customer (phone confirmation): by a
 * connected system (EcoManager, the landing site…), a CSV import, or by hand.
 * Only confirmed orders reach the card print queue.
 */
export const ORDER_CONFIRMATION_SOURCES = ["integration", "import", "manual"] as const;
export type OrderConfirmationSource = (typeof ORDER_CONFIRMATION_SOURCES)[number];

export const ORDER_ITEM_KINDS = ["activation_card", "course_access"] as const;

export const PAYMENT_PROVIDERS = [
  "cash",
  "cash_on_delivery",
  "bank_transfer",
  "postal_transfer",
  "card_gateway",
  "other",
] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Normalised delivery states (each carrier's own labels are kept in carrier_status). */
export const SHIPMENT_STATUSES = [
  "pending",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed_attempt",
  "returned",
  "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_EVENT_SOURCES = ["webhook", "poll", "manual", "import"] as const;
export type ShipmentEventSource = (typeof SHIPMENT_EVENT_SOURCES)[number];

export const INTEGRATION_EVENT_STATUSES = ["processed", "ignored", "failed"] as const;
export type IntegrationEventStatus = (typeof INTEGRATION_EVENT_STATUSES)[number];

export const REFUND_STATUSES = ["requested", "approved", "rejected", "processed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const DISCOUNT_KINDS = ["percent", "fixed"] as const;

export const INVOICE_STATUSES = ["issued", "void"] as const;

// Community -------------------------------------------------------------------------------
export const COMMUNITY_SPACE_KEYS = [
  "general",
  /** Group chat room: short messages shown as a live conversation. */
  "chat",
  "questions",
  "success_stories",
  "case_studies",
  "resources",
  "announcements",
  "challenges",
] as const;
export type CommunitySpaceKey = (typeof COMMUNITY_SPACE_KEYS)[number];

export const POSTING_POLICIES = ["members", "staff_only"] as const;

export const UGC_STATUSES = ["published", "hidden", "removed"] as const;
export type UgcStatus = (typeof UGC_STATUSES)[number];

export const REACTION_TYPES = ["like", "love", "insightful", "celebrate", "support"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const REPORT_REASONS = [
  "spam",
  "abuse",
  "harassment",
  "off_topic",
  "misinformation",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// Live sessions -------------------------------------------------------------------------------
export const LIVE_SESSION_KINDS = ["group", "one_on_one"] as const;
export type LiveSessionKind = (typeof LIVE_SESSION_KINDS)[number];
export const LIVE_SESSION_STATUSES = ["scheduled", "live", "ended", "cancelled"] as const;
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];
/** Where the session takes place (YouTube / Facebook: a live stream; the others: a meeting). */
export const MEETING_PROVIDERS = [
  "youtube",
  "facebook",
  "zoom",
  "google_meet",
  "jitsi",
  "teams",
  "custom",
] as const;
export type MeetingProvider = (typeof MEETING_PROVIDERS)[number];
export const BOOKING_STATUSES = ["booked", "cancelled", "attended", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const AVAILABILITY_STATUSES = ["open", "booked", "blocked"] as const;

// Notifications ------------------------------------------------------------------------------
/** In-app notification kinds; texts come from the "notifications" dictionary (type + data). */
export const NOTIFICATION_TYPES = [
  /** data: { postTitle?: string } — someone commented on your post */
  "community.reply",
  /** data: { postTitle?: string } — your answer was marked as the verified answer */
  "community.answer_verified",
  /** data: { postTitle?: string } — the team posted in Announcements */
  "community.announcement",
  /** data: { title: string, startsAt: string (ISO) } */
  "live.scheduled",
  /** data: { title: string, startsAt: string (ISO) } */
  "live.cancelled",
  /** data: { title: string } — a replay is available */
  "live.recording",
  /** data: { certificateNumber: string } */
  "certificate.issued",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Support ---------------------------------------------------------------------------------------
export const TICKET_CATEGORIES = [
  "access",
  "technical",
  "billing",
  "content",
  "account_recovery",
  "other",
] as const;
export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

// Platform / compliance -------------------------------------------------------------------------
export const DATA_REQUEST_KINDS = ["export", "deletion"] as const;
export const DATA_REQUEST_STATUSES = ["pending", "processing", "completed", "rejected"] as const;
export const CONSENT_KINDS = ["terms", "privacy", "marketing"] as const;
export const EMAIL_DELIVERY_STATUSES = ["sent", "failed"] as const;
