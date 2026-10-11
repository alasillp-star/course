ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_provider_check";--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "provider_upload_id" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "attach_to_lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "video_progress" ADD COLUMN "watched_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "video_progress" ADD COLUMN "last_heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_attach_to_lesson_id_lessons_id_fk" FOREIGN KEY ("attach_to_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_attach_lesson_idx" ON "media_assets" USING btree ("attach_to_lesson_id") WHERE "media_assets"."attach_to_lesson_id" is not null;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_provider_check" CHECK ("media_assets"."provider" in ('mux', 'cloudflare_stream', 's3', 'supabase_storage', 'external', 'local'));