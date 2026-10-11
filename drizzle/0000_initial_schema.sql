CREATE SEQUENCE "public"."invoice_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."ticket_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "auth_mfa_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text DEFAULT 'totp' NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_used_step" bigint,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_mfa_factors_type_check" CHECK ("auth_mfa_factors"."type" in ('totp'))
);
--> statement-breakpoint
CREATE TABLE "auth_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"max_attempts" smallint DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"activation_code_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_otp_challenges_purpose_check" CHECK ("auth_otp_challenges"."purpose" in ('login', 'activation', 'email_change')),
	CONSTRAINT "auth_otp_challenges_attempts_check" CHECK ("auth_otp_challenges"."attempts" >= 0 and "auth_otp_challenges"."attempts" <= "auth_otp_challenges"."max_attempts"),
	CONSTRAINT "auth_otp_challenges_activation_check" CHECK (("auth_otp_challenges"."purpose" = 'activation') = ("auth_otp_challenges"."activation_code_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "auth_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"client_type" text DEFAULT 'web' NOT NULL,
	"authenticated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"ip_address" "inet",
	"user_agent" text,
	"device_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_client_type_check" CHECK ("auth_sessions"."client_type" in ('web', 'mobile'))
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" "inet",
	CONSTRAINT "consents_kind_check" CHECK ("consents"."kind" in ('terms', 'privacy', 'marketing'))
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"handled_by" uuid,
	"result_storage_key" text,
	"notes" text,
	CONSTRAINT "data_requests_kind_check" CHECK ("data_requests"."kind" in ('export', 'deletion')),
	CONSTRAINT "data_requests_status_check" CHECK ("data_requests"."status" in ('pending', 'processing', 'completed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"full_name" text,
	"phone" text,
	"country" text,
	"city" text,
	"bio" text,
	"avatar_url" text,
	"timezone" text DEFAULT 'Africa/Algiers' NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_email_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"old_email" text NOT NULL,
	"new_email" text NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"suspended_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'suspended', 'deleted')),
	CONSTRAINT "users_locale_check" CHECK ("users"."locale" in ('ar', 'fr', 'en')),
	CONSTRAINT "users_email_normalized_check" CHECK ("users"."email" = lower(btrim("users"."email"))),
	CONSTRAINT "users_suspension_consistency_check" CHECK (("users"."status" = 'suspended') = ("users"."suspended_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "course_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "course_modules_status_check" CHECK ("course_modules"."status" in ('draft', 'published', 'hidden'))
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"subtitle" jsonb,
	"description" jsonb,
	"cover_image_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"default_locale" text DEFAULT 'ar' NOT NULL,
	"list_price_minor" bigint,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "courses_status_check" CHECK ("courses"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "courses_currency_check" CHECK ("courses"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "lesson_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" jsonb NOT NULL,
	"url" text,
	"asset_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_resources_kind_check" CHECK ("lesson_resources"."kind" in ('pdf', 'spreadsheet', 'link', 'file')),
	CONSTRAINT "lesson_resources_target_check" CHECK (("lesson_resources"."kind" = 'link' and "lesson_resources"."url" is not null) or ("lesson_resources"."kind" <> 'link' and "lesson_resources"."asset_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"summary" jsonb,
	"body" jsonb,
	"video_asset_id" uuid,
	"duration_seconds" integer,
	"is_free_preview" boolean DEFAULT false NOT NULL,
	"completion_threshold_percent" integer DEFAULT 90 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "lessons_status_check" CHECK ("lessons"."status" in ('draft', 'published', 'hidden')),
	CONSTRAINT "lessons_completion_threshold_check" CHECK ("lessons"."completion_threshold_percent" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_asset_id" text,
	"playback_id" text,
	"storage_key" text,
	"original_filename" text,
	"mime_type" text,
	"size_bytes" bigint,
	"duration_seconds" integer,
	"width" integer,
	"height" integer,
	"checksum_sha256" text,
	"status" text DEFAULT 'pending_upload' NOT NULL,
	"failure_reason" text,
	"uploaded_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_assets_kind_check" CHECK ("media_assets"."kind" in ('video', 'document', 'image', 'audio', 'other')),
	CONSTRAINT "media_assets_provider_check" CHECK ("media_assets"."provider" in ('mux', 'cloudflare_stream', 's3', 'supabase_storage', 'external')),
	CONSTRAINT "media_assets_status_check" CHECK ("media_assets"."status" in ('pending_upload', 'processing', 'ready', 'failed', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "video_text_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"kind" text DEFAULT 'subtitles' NOT NULL,
	"label" text NOT NULL,
	"provider_track_id" text,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_text_tracks_kind_check" CHECK ("video_text_tracks"."kind" in ('subtitles', 'captions'))
);
--> statement-breakpoint
CREATE TABLE "video_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"full_text" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(full_text, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_progress" (
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"completed_lessons" integer DEFAULT 0 NOT NULL,
	"total_lessons" integer DEFAULT 0 NOT NULL,
	"percent_complete" smallint DEFAULT 0 NOT NULL,
	"last_lesson_id" uuid,
	"last_activity_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_progress_user_id_course_id_pk" PRIMARY KEY("user_id","course_id"),
	CONSTRAINT "course_progress_percent_check" CHECK ("course_progress"."percent_complete" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"percent_complete" smallint DEFAULT 0 NOT NULL,
	"first_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id"),
	CONSTRAINT "lesson_progress_status_check" CHECK ("lesson_progress"."status" in ('in_progress', 'completed')),
	CONSTRAINT "lesson_progress_percent_check" CHECK ("lesson_progress"."percent_complete" between 0 and 100),
	CONSTRAINT "lesson_progress_completed_check" CHECK (("lesson_progress"."status" = 'completed') = ("lesson_progress"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "student_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"video_timestamp_seconds" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "student_notes_body_length_check" CHECK (char_length("student_notes"."body") between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "video_progress" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"asset_id" uuid,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"max_position_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id"),
	CONSTRAINT "video_progress_non_negative_check" CHECK ("video_progress"."position_seconds" >= 0 and "video_progress"."watched_seconds" >= 0 and "video_progress"."max_position_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assignment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_number" smallint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"text_answer" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"graded_at" timestamp with time zone,
	"graded_by" uuid,
	"score" smallint,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_submissions_status_check" CHECK ("assignment_submissions"."status" in ('submitted', 'under_review', 'needs_revision', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_id" uuid,
	"title" jsonb NOT NULL,
	"instructions" jsonb NOT NULL,
	"max_score" smallint DEFAULT 100 NOT NULL,
	"pass_score" smallint DEFAULT 60 NOT NULL,
	"allow_resubmission" boolean DEFAULT true NOT NULL,
	"accepts_files" boolean DEFAULT true NOT NULL,
	"accepts_links" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assignments_status_check" CHECK ("assignments"."status" in ('draft', 'published', 'hidden')),
	CONSTRAINT "assignments_scores_check" CHECK ("assignments"."pass_score" between 0 and "assignments"."max_score")
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"recipient_name_snapshot" text NOT NULL,
	"course_title_snapshot" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"pdf_storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_number" smallint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score_percent" smallint,
	"passed" boolean,
	CONSTRAINT "quiz_attempts_score_check" CHECK ("quiz_attempts"."score_percent" is null or "quiz_attempts"."score_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "quiz_question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" jsonb NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"type" text NOT NULL,
	"prompt" jsonb NOT NULL,
	"explanation" jsonb,
	"points" smallint DEFAULT 1 NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_questions_type_check" CHECK ("quiz_questions"."type" in ('single_choice', 'multiple_choice', 'true_false')),
	CONSTRAINT "quiz_questions_points_check" CHECK ("quiz_questions"."points" > 0)
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_id" uuid,
	"module_id" uuid,
	"title" jsonb NOT NULL,
	"description" jsonb,
	"pass_score_percent" smallint DEFAULT 70 NOT NULL,
	"max_attempts" smallint,
	"time_limit_seconds" integer,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"show_correct_answers" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quizzes_status_check" CHECK ("quizzes"."status" in ('draft', 'published', 'hidden')),
	CONSTRAINT "quizzes_pass_score_check" CHECK ("quizzes"."pass_score_percent" between 0 and 100),
	CONSTRAINT "quizzes_max_attempts_check" CHECK ("quizzes"."max_attempts" is null or "quizzes"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "submission_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" serial NOT NULL,
	"serial_prefix" text NOT NULL,
	"name" text NOT NULL,
	"course_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"requires_pin" boolean DEFAULT true NOT NULL,
	"requires_sale" boolean DEFAULT true NOT NULL,
	"redeem_by" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"card_template_id" uuid,
	"notes" text,
	"export_count" integer DEFAULT 0 NOT NULL,
	"last_exported_at" timestamp with time zone,
	"secrets_purged_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activation_batches_status_check" CHECK ("activation_batches"."status" in ('active', 'archived')),
	CONSTRAINT "activation_batches_quantity_check" CHECK ("activation_batches"."quantity" between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "activation_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"serial" text NOT NULL,
	"code_hash" text NOT NULL,
	"code_ciphertext" text,
	"pin_hash" text,
	"pin_ciphertext" text,
	"status" text DEFAULT 'available' NOT NULL,
	"failed_pin_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"sold_at" timestamp with time zone,
	"sold_by" uuid,
	"order_id" uuid,
	"order_item_id" uuid,
	"activated_at" timestamp with time zone,
	"activated_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	"replaces_code_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activation_codes_status_check" CHECK ("activation_codes"."status" in ('available', 'sold', 'activated', 'revoked')),
	CONSTRAINT "activation_codes_activated_check" CHECK (("activation_codes"."status" = 'activated') = ("activation_codes"."activated_at" is not null and "activation_codes"."activated_by_user_id" is not null)),
	CONSTRAINT "activation_codes_revoked_check" CHECK (("activation_codes"."status" = 'revoked') = ("activation_codes"."revoked_at" is not null)),
	CONSTRAINT "activation_codes_sold_check" CHECK ("activation_codes"."status" <> 'sold' or "activation_codes"."sold_at" is not null),
	CONSTRAINT "activation_codes_consumed_secrets_check" CHECK ("activation_codes"."status" not in ('activated', 'revoked') or ("activation_codes"."code_ciphertext" is null and "activation_codes"."pin_ciphertext" is null)),
	CONSTRAINT "activation_codes_pin_attempts_check" CHECK ("activation_codes"."failed_pin_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "activation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"code_id" uuid,
	"actor_user_id" uuid,
	"ip_address" "inet",
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activation_events_type_check" CHECK ("activation_events"."type" in ('batch_created', 'batch_exported', 'batch_secrets_purged', 'code_sold', 'code_unsold', 'code_activated', 'code_revoked', 'code_replaced', 'code_locked', 'code_unlocked', 'pin_failed', 'redemption_rejected'))
);
--> statement-breakpoint
CREATE TABLE "card_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"background_asset_id" uuid,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text NOT NULL,
	"activation_code_id" uuid,
	"order_id" uuid,
	"granted_by" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_entitlements_status_check" CHECK ("course_entitlements"."status" in ('active', 'revoked')),
	CONSTRAINT "course_entitlements_source_check" CHECK ("course_entitlements"."source" in ('activation_code', 'order', 'manual_grant', 'subscription', 'migration')),
	CONSTRAINT "course_entitlements_source_ref_check" CHECK ("course_entitlements"."source" <> 'activation_code' or "course_entitlements"."activation_code_id" is not null),
	CONSTRAINT "course_entitlements_revoked_check" CHECK (("course_entitlements"."status" = 'revoked') = ("course_entitlements"."revoked_at" is not null)),
	CONSTRAINT "course_entitlements_period_check" CHECK ("course_entitlements"."expires_at" is null or "course_entitlements"."expires_at" > "course_entitlements"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"city" text,
	"region" text,
	"country" text DEFAULT 'DZ' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"currency" text,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_kind_check" CHECK ("discount_codes"."kind" in ('percent', 'fixed')),
	CONSTRAINT "discount_codes_code_normalized_check" CHECK ("discount_codes"."code" = upper("discount_codes"."code")),
	CONSTRAINT "discount_codes_value_check" CHECK ("discount_codes"."value" > 0 and ("discount_codes"."kind" <> 'percent' or "discount_codes"."value" <= 10000)),
	CONSTRAINT "discount_codes_redemptions_check" CHECK ("discount_codes"."max_redemptions" is null or "discount_codes"."redemption_count" <= "discount_codes"."max_redemptions")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"billing_snapshot" jsonb NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"pdf_storage_key" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('issued', 'void'))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"course_id" uuid,
	"activation_code_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_kind_check" CHECK ("order_items"."kind" in ('activation_card', 'course_access')),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_total_check" CHECK ("order_items"."unit_price_minor" >= 0 and "order_items"."total_minor" = "order_items"."unit_price_minor" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid,
	"sales_agent_id" uuid,
	"channel" text DEFAULT 'in_person' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"subtotal_minor" bigint DEFAULT 0 NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL,
	"tax_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint DEFAULT 0 NOT NULL,
	"discount_code_id" uuid,
	"notes" text,
	"placed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('draft', 'pending_payment', 'paid', 'cancelled', 'refunded', 'partially_refunded')),
	CONSTRAINT "orders_channel_check" CHECK ("orders"."channel" in ('in_person', 'reseller', 'phone', 'online')),
	CONSTRAINT "orders_currency_check" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal_minor" >= 0 and "orders"."discount_minor" >= 0 and "orders"."tax_minor" >= 0 and "orders"."total_minor" = "orders"."subtotal_minor" - "orders"."discount_minor" + "orders"."tax_minor" and "orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"provider_reference" text,
	"idempotency_key" text,
	"received_by" uuid,
	"received_at" timestamp with time zone,
	"failure_reason" text,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_check" CHECK ("payments"."provider" in ('cash', 'bank_transfer', 'postal_transfer', 'card_gateway', 'other')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('pending', 'succeeded', 'failed', 'cancelled', 'refunded')),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"revoke_access" boolean DEFAULT true NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"provider_reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_status_check" CHECK ("refunds"."status" in ('requested', 'approved', 'rejected', 'processed')),
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "community_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"banned_by" uuid,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"lesson_id" uuid,
	"title" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"pinned_at" timestamp with time zone,
	"pinned_by" uuid,
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"moderated_at" timestamp with time zone,
	"moderated_by" uuid,
	"moderation_reason" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title, '') || ' ' || body)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "community_posts_status_check" CHECK ("community_posts"."status" in ('published', 'hidden', 'removed')),
	CONSTRAINT "community_posts_body_length_check" CHECK (char_length("community_posts"."body") between 1 and 20000),
	CONSTRAINT "community_posts_counts_check" CHECK ("community_posts"."reaction_count" >= 0 and "community_posts"."comment_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "community_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"posting_policy" text DEFAULT 'members' NOT NULL,
	"allows_verified_answers" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_spaces_key_check" CHECK ("community_spaces"."key" in ('general', 'questions', 'success_stories', 'case_studies', 'resources', 'announcements', 'challenges')),
	CONSTRAINT "community_spaces_posting_policy_check" CHECK ("community_spaces"."posting_policy" in ('members', 'staff_only'))
);
--> statement-breakpoint
CREATE TABLE "community_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_tags_slug_check" CHECK ("community_tags"."slug" ~ '^[a-z0-9\u0600-\u06ff_-]{1,50}$')
);
--> statement-breakpoint
CREATE TABLE "post_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"is_verified_answer" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"edited_at" timestamp with time zone,
	"moderated_at" timestamp with time zone,
	"moderated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "post_comments_status_check" CHECK ("post_comments"."status" in ('published', 'hidden', 'removed')),
	CONSTRAINT "post_comments_body_length_check" CHECK (char_length("post_comments"."body") between 1 and 10000),
	CONSTRAINT "post_comments_verified_check" CHECK ("post_comments"."is_verified_answer" = ("post_comments"."verified_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "post_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"mentioned_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_mentions_target_check" CHECK (num_nonnulls("post_mentions"."post_id", "post_mentions"."comment_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"type" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_type_check" CHECK ("post_reactions"."type" in ('like', 'love', 'insightful', 'celebrate', 'support')),
	CONSTRAINT "post_reactions_target_check" CHECK (num_nonnulls("post_reactions"."post_id", "post_reactions"."comment_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "post_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reports_reason_check" CHECK ("post_reports"."reason" in ('spam', 'abuse', 'harassment', 'off_topic', 'misinformation', 'other')),
	CONSTRAINT "post_reports_status_check" CHECK ("post_reports"."status" in ('open', 'resolved', 'dismissed')),
	CONSTRAINT "post_reports_target_check" CHECK (num_nonnulls("post_reports"."post_id", "post_reports"."comment_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "post_tags" (
	"post_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "post_tags_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "coach_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_availability_status_check" CHECK ("coach_availability"."status" in ('open', 'booked', 'blocked')),
	CONSTRAINT "coach_availability_period_check" CHECK ("coach_availability"."ends_at" > "coach_availability"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"locale" text NOT NULL,
	"transport" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_deliveries_status_check" CHECK ("email_deliveries"."status" in ('sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" text DEFAULT 'group' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"host_user_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer,
	"provider" text DEFAULT 'custom' NOT NULL,
	"provider_meeting_id" text,
	"join_url_ciphertext" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"recording_asset_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "live_sessions_kind_check" CHECK ("live_sessions"."kind" in ('group', 'one_on_one')),
	CONSTRAINT "live_sessions_status_check" CHECK ("live_sessions"."status" in ('scheduled', 'live', 'ended', 'cancelled')),
	CONSTRAINT "live_sessions_provider_check" CHECK ("live_sessions"."provider" in ('zoom', 'google_meet', 'jitsi', 'teams', 'custom')),
	CONSTRAINT "live_sessions_period_check" CHECK ("live_sessions"."ends_at" > "live_sessions"."starts_at"),
	CONSTRAINT "live_sessions_capacity_check" CHECK ("live_sessions"."capacity" is null or "live_sessions"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	CONSTRAINT "session_bookings_status_check" CHECK ("session_bookings"."status" in ('booked', 'cancelled', 'attended', 'no_show'))
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" text NOT NULL,
	"requester_id" uuid,
	"requester_email" text,
	"category" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"subject" text NOT NULL,
	"assignee_id" uuid,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_category_check" CHECK ("support_tickets"."category" in ('access', 'technical', 'billing', 'content', 'account_recovery', 'other')),
	CONSTRAINT "support_tickets_status_check" CHECK ("support_tickets"."status" in ('open', 'pending', 'resolved', 'closed')),
	CONSTRAINT "support_tickets_priority_check" CHECK ("support_tickets"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "support_tickets_requester_check" CHECK ("support_tickets"."requester_id" is not null or "support_tickets"."requester_email" is not null)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip_address" "inet",
	"user_agent" text,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_logs_actor_type_check" CHECK ("audit_logs"."actor_type" in ('user', 'system'))
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_mfa_factors" ADD CONSTRAINT "auth_mfa_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_otp_challenges" ADD CONSTRAINT "auth_otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_otp_challenges" ADD CONSTRAINT "auth_otp_challenges_activation_code_id_activation_codes_id_fk" FOREIGN KEY ("activation_code_id") REFERENCES "public"."activation_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_recovery_codes" ADD CONSTRAINT "auth_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_changes" ADD CONSTRAINT "user_email_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_changes" ADD CONSTRAINT "user_email_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_course_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_video_asset_id_media_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_text_tracks" ADD CONSTRAINT "video_text_tracks_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_transcripts" ADD CONSTRAINT "video_transcripts_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_last_lesson_id_lessons_id_fk" FOREIGN KEY ("last_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_progress" ADD CONSTRAINT "video_progress_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_question_options" ADD CONSTRAINT "quiz_question_options_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_course_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_batches" ADD CONSTRAINT "activation_batches_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_batches" ADD CONSTRAINT "activation_batches_card_template_id_card_templates_id_fk" FOREIGN KEY ("card_template_id") REFERENCES "public"."card_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_batches" ADD CONSTRAINT "activation_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_batch_id_activation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."activation_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_sold_by_users_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_replaces_code_id_activation_codes_id_fk" FOREIGN KEY ("replaces_code_id") REFERENCES "public"."activation_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_batch_id_activation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."activation_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_code_id_activation_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."activation_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_background_asset_id_media_assets_id_fk" FOREIGN KEY ("background_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_activation_code_id_activation_codes_id_fk" FOREIGN KEY ("activation_code_id") REFERENCES "public"."activation_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_entitlements" ADD CONSTRAINT "course_entitlements_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_activation_code_id_activation_codes_id_fk" FOREIGN KEY ("activation_code_id") REFERENCES "public"."activation_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_agent_id_users_id_fk" FOREIGN KEY ("sales_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_space_id_community_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."community_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_spaces" ADD CONSTRAINT "community_spaces_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_comment_id_post_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_comment_id_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_comment_id_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_comment_id_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_community_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."community_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_recording_asset_id_media_assets_id_fk" FOREIGN KEY ("recording_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_bookings" ADD CONSTRAINT "session_bookings_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_bookings" ADD CONSTRAINT "session_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_mfa_factors_one_active_key" ON "auth_mfa_factors" USING btree ("user_id","type") WHERE "auth_mfa_factors"."disabled_at" is null;--> statement-breakpoint
CREATE INDEX "auth_otp_challenges_email_idx" ON "auth_otp_challenges" USING btree ("email","purpose","created_at");--> statement-breakpoint
CREATE INDEX "auth_otp_challenges_expires_idx" ON "auth_otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_recovery_codes_hash_key" ON "auth_recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "auth_recovery_codes_user_idx" ON "auth_recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_active_idx" ON "auth_sessions" USING btree ("user_id","last_seen_at") WHERE "auth_sessions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "data_requests_user_idx" ON "data_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_reset_idx" ON "rate_limit_buckets" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "user_email_changes_user_idx" ON "user_email_changes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_last_seen_at_idx" ON "users" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_key" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "course_modules_course_position_idx" ON "course_modules" USING btree ("course_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_key" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "lesson_resources_lesson_idx" ON "lesson_resources" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_course_slug_key" ON "lessons" USING btree ("course_id","slug") WHERE "lessons"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "lessons_module_position_idx" ON "lessons" USING btree ("module_id","position");--> statement-breakpoint
CREATE INDEX "lessons_course_idx" ON "lessons" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_provider_asset_key" ON "media_assets" USING btree ("provider","provider_asset_id") WHERE "media_assets"."provider_asset_id" is not null;--> statement-breakpoint
CREATE INDEX "media_assets_kind_idx" ON "media_assets" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "video_text_tracks_asset_locale_kind_key" ON "video_text_tracks" USING btree ("asset_id","locale","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "video_transcripts_asset_locale_key" ON "video_transcripts" USING btree ("asset_id","locale");--> statement-breakpoint
CREATE INDEX "video_transcripts_search_idx" ON "video_transcripts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "course_progress_course_activity_idx" ON "course_progress" USING btree ("course_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "lesson_progress_course_user_idx" ON "lesson_progress" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "student_notes_user_lesson_idx" ON "student_notes" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_submissions_attempt_key" ON "assignment_submissions" USING btree ("assignment_id","user_id","attempt_number");--> statement-breakpoint
CREATE INDEX "assignment_submissions_review_queue_idx" ON "assignment_submissions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "assignments_lesson_idx" ON "assignments" USING btree ("lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_number_key" ON "certificates" USING btree ("certificate_number");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_user_course_active_key" ON "certificates" USING btree ("user_id","course_id") WHERE "certificates"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_user_attempt_key" ON "quiz_attempts" USING btree ("quiz_id","user_id","attempt_number");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_idx" ON "quiz_attempts" USING btree ("user_id","quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_question_options_question_idx" ON "quiz_question_options" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "quiz_questions_quiz_idx" ON "quiz_questions" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "quizzes_lesson_idx" ON "quizzes" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "submission_attachments_submission_idx" ON "submission_attachments" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_batches_number_key" ON "activation_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_batches_serial_prefix_key" ON "activation_batches" USING btree ("serial_prefix");--> statement-breakpoint
CREATE INDEX "activation_batches_course_idx" ON "activation_batches" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_codes_code_hash_key" ON "activation_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_codes_serial_key" ON "activation_codes" USING btree ("serial");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_codes_batch_sequence_key" ON "activation_codes" USING btree ("batch_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "activation_codes_replaces_key" ON "activation_codes" USING btree ("replaces_code_id") WHERE "activation_codes"."replaces_code_id" is not null;--> statement-breakpoint
CREATE INDEX "activation_codes_batch_status_idx" ON "activation_codes" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "activation_codes_activated_by_idx" ON "activation_codes" USING btree ("activated_by_user_id");--> statement-breakpoint
CREATE INDEX "activation_codes_order_idx" ON "activation_codes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "activation_events_code_idx" ON "activation_events" USING btree ("code_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activation_events_batch_idx" ON "activation_events" USING btree ("batch_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activation_events_type_idx" ON "activation_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_entitlements_active_key" ON "course_entitlements" USING btree ("user_id","course_id") WHERE "course_entitlements"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "course_entitlements_activation_code_key" ON "course_entitlements" USING btree ("activation_code_id") WHERE "course_entitlements"."activation_code_id" is not null;--> statement-breakpoint
CREATE INDEX "course_entitlements_course_idx" ON "course_entitlements" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_user_idx" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_activation_code_key" ON "order_items" USING btree ("activation_code_id") WHERE "order_items"."activation_code_id" is not null;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_key" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_sales_agent_idx" ON "orders" USING btree ("sales_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_key" ON "payment_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_unprocessed_idx" ON "payment_webhook_events" USING btree ("received_at") WHERE "payment_webhook_events"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key" ON "payments" USING btree ("idempotency_key") WHERE "payments"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments" USING btree ("provider","provider_reference") WHERE "payments"."provider_reference" is not null;--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_received_idx" ON "payments" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "community_bans_user_idx" ON "community_bans" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "community_posts_feed_idx" ON "community_posts" USING btree ("space_id","status","last_activity_at");--> statement-breakpoint
CREATE INDEX "community_posts_pinned_idx" ON "community_posts" USING btree ("space_id","pinned_at") WHERE "community_posts"."pinned_at" is not null;--> statement-breakpoint
CREATE INDEX "community_posts_author_idx" ON "community_posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_lesson_idx" ON "community_posts" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "community_posts_search_idx" ON "community_posts" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "community_spaces_course_key_key" ON "community_spaces" USING btree ("course_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "community_tags_slug_key" ON "community_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "post_attachments_post_idx" ON "post_attachments" USING btree ("post_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "post_comments_one_verified_key" ON "post_comments" USING btree ("post_id") WHERE "post_comments"."is_verified_answer";--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "post_comments_author_idx" ON "post_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_mentions_user_idx" ON "post_mentions" USING btree ("mentioned_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_user_post_key" ON "post_reactions" USING btree ("user_id","post_id") WHERE "post_reactions"."post_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_user_comment_key" ON "post_reactions" USING btree ("user_id","comment_id") WHERE "post_reactions"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "post_reactions_post_idx" ON "post_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_reactions_comment_idx" ON "post_reactions" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_reports_reporter_post_key" ON "post_reports" USING btree ("reporter_id","post_id") WHERE "post_reports"."post_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "post_reports_reporter_comment_key" ON "post_reports" USING btree ("reporter_id","comment_id") WHERE "post_reports"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "post_reports_queue_idx" ON "post_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "post_tags_tag_idx" ON "post_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "coach_availability_coach_idx" ON "coach_availability" USING btree ("coach_user_id","starts_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_to_idx" ON "email_deliveries" USING btree ("to_email","created_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_created_idx" ON "email_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "live_sessions_schedule_idx" ON "live_sessions" USING btree ("course_id","starts_at");--> statement-breakpoint
CREATE INDEX "notifications_user_feed_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "session_bookings_session_user_key" ON "session_bookings" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "session_bookings_user_idx" ON "session_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "support_tickets_queue_idx" ON "support_tickets" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_requester_idx" ON "support_tickets" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id","occurred_at");