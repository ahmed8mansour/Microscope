CREATE TABLE "admin_auth_attempts" (
	"ip" text PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_auth_attempts_count_check" CHECK ("admin_auth_attempts"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin_auth_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step" text NOT NULL,
	"session_id" text NOT NULL,
	"source" text,
	"referrer" text,
	"campaign" text,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_events_step_check" CHECK ("analytics_events"."step" in ('entry','payment','conversion'))
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_notes_body_length_check" CHECK (char_length("order_notes"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "order_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"provider_refund_ref" text,
	"reason" text,
	"requested_by" text NOT NULL,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount" >= 0),
	CONSTRAINT "refunds_currency_check" CHECK (char_length("refunds"."currency") = 3),
	CONSTRAINT "refunds_status_check" CHECK ("refunds"."status" in ('requested','failed')),
	CONSTRAINT "refunds_reason_length_check" CHECK ("refunds"."reason" is null or char_length("refunds"."reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_entry_session_uidx" ON "analytics_events" USING btree ("session_id") WHERE "analytics_events"."step" = 'entry';--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_conversion_order_uidx" ON "analytics_events" USING btree ("order_id") WHERE "analytics_events"."step" = 'conversion';--> statement-breakpoint
CREATE INDEX "analytics_events_step_created_at_idx" ON "analytics_events" USING btree ("step","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_session_id_idx" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "analytics_events_order_id_idx" ON "analytics_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_notes_order_id_created_at_idx" ON "order_notes" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_order_id_uidx" ON "refunds" USING btree ("order_id");