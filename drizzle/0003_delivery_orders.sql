CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"tracking_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"carrier_status" text,
	"delivered_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_status_check" CHECK ("shipments"."status" in ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'failed_attempt', 'returned', 'cancelled')),
	CONSTRAINT "shipments_delivered_check" CHECK ("shipments"."status" <> 'delivered' or "shipments"."delivered_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"status" text NOT NULL,
	"error" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_events_status_check" CHECK ("integration_events"."status" in ('processed', 'ignored', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "activation_events" DROP CONSTRAINT "activation_events_type_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_provider_check";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_address" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_order_key" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_carrier_tracking_key" ON "shipments" USING btree ("carrier","tracking_number");--> statement-breakpoint
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_events_source_external_key" ON "integration_events" USING btree ("source","external_id") WHERE "integration_events"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "integration_events_source_received_idx" ON "integration_events" USING btree ("source","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_external_key" ON "orders" USING btree ("external_source","external_id") WHERE "orders"."external_id" is not null;--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_type_check" CHECK ("activation_events"."type" in ('batch_created', 'batch_exported', 'batch_secrets_purged', 'code_sold', 'code_unsold', 'code_assigned', 'code_unassigned', 'code_activated', 'code_revoked', 'code_replaced', 'code_locked', 'code_unlocked', 'pin_failed', 'redemption_rejected'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_check" CHECK ("payments"."provider" in ('cash', 'cash_on_delivery', 'bank_transfer', 'postal_transfer', 'card_gateway', 'other'));--> statement-breakpoint
-- Same lock-down as 0001 for new tables (RLS on, no policies: API roles see nothing).
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_events" ENABLE ROW LEVEL SECURITY;
