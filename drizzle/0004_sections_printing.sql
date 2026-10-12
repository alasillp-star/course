CREATE TABLE "card_print_job_items" (
	"job_id" uuid NOT NULL,
	"code_id" uuid NOT NULL,
	"order_id" uuid,
	"position" integer NOT NULL,
	CONSTRAINT "card_print_job_items_job_id_code_id_pk" PRIMARY KEY("job_id","code_id")
);
--> statement-breakpoint
CREATE TABLE "card_print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"layout" text NOT NULL,
	"batch_id" uuid,
	"card_count" integer NOT NULL,
	"selection" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_print_jobs_kind_check" CHECK ("card_print_jobs"."kind" in ('blank', 'personalized')),
	CONSTRAINT "card_print_jobs_layout_check" CHECK ("card_print_jobs"."layout" in ('a4_sheet', 'single_card')),
	CONSTRAINT "card_print_jobs_count_check" CHECK ("card_print_jobs"."card_count" between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "auth_otp_challenges" DROP CONSTRAINT "auth_otp_challenges_purpose_check";--> statement-breakpoint
ALTER TABLE "activation_events" DROP CONSTRAINT "activation_events_type_check";--> statement-breakpoint
ALTER TABLE "community_spaces" DROP CONSTRAINT "community_spaces_key_check";--> statement-breakpoint
ALTER TABLE "live_sessions" DROP CONSTRAINT "live_sessions_provider_check";--> statement-breakpoint
ALTER TABLE "activation_codes" ADD COLUMN "print_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activation_codes" ADD COLUMN "last_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_via" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "recording_url_ciphertext" text;--> statement-breakpoint
ALTER TABLE "card_print_job_items" ADD CONSTRAINT "card_print_job_items_job_id_card_print_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."card_print_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_print_job_items" ADD CONSTRAINT "card_print_job_items_code_id_activation_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."activation_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_print_job_items" ADD CONSTRAINT "card_print_job_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_print_jobs" ADD CONSTRAINT "card_print_jobs_batch_id_activation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."activation_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_print_jobs" ADD CONSTRAINT "card_print_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_print_job_items_code_idx" ON "card_print_job_items" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "card_print_job_items_order_idx" ON "card_print_job_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "card_print_jobs_created_idx" ON "card_print_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "card_print_jobs_batch_idx" ON "card_print_jobs" USING btree ("batch_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activation_codes_unprinted_idx" ON "activation_codes" USING btree ("batch_id","sequence") WHERE "activation_codes"."print_count" = 0 and "activation_codes"."status" = 'available' and "activation_codes"."order_id" is null;--> statement-breakpoint
CREATE INDEX "orders_print_queue_idx" ON "orders" USING btree ("confirmed_at") WHERE "orders"."confirmed_at" is not null and "orders"."status" <> 'cancelled';--> statement-breakpoint
ALTER TABLE "auth_otp_challenges" ADD CONSTRAINT "auth_otp_challenges_purpose_check" CHECK ("auth_otp_challenges"."purpose" in ('login', 'activation', 'email_change', 'staff_verification'));--> statement-breakpoint
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_print_check" CHECK ("activation_codes"."print_count" >= 0 and ("activation_codes"."print_count" = 0) = ("activation_codes"."last_printed_at" is null));--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_type_check" CHECK ("activation_events"."type" in ('batch_created', 'batch_exported', 'batch_secrets_purged', 'code_sold', 'code_unsold', 'code_assigned', 'code_unassigned', 'code_activated', 'code_revoked', 'code_replaced', 'code_locked', 'code_unlocked', 'pin_failed', 'redemption_rejected', 'code_printed'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_via_check" CHECK ("orders"."confirmed_via" in ('integration', 'import', 'manual'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmation_check" CHECK (("orders"."confirmed_at" is null) = ("orders"."confirmed_via" is null));--> statement-breakpoint
ALTER TABLE "community_spaces" ADD CONSTRAINT "community_spaces_key_check" CHECK ("community_spaces"."key" in ('general', 'chat', 'questions', 'success_stories', 'case_studies', 'resources', 'announcements', 'challenges'));--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_provider_check" CHECK ("live_sessions"."provider" in ('youtube', 'facebook', 'zoom', 'google_meet', 'jitsi', 'teams', 'custom'));--> statement-breakpoint
-- Same lock-down as 0001 for new tables (RLS on, no policies: API roles see nothing).
ALTER TABLE "card_print_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "card_print_job_items" ENABLE ROW LEVEL SECURITY;
