CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"fulfilled" boolean DEFAULT false NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_receipt_url" text,
	"stripe_customer_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_amount_check" CHECK ("orders"."amount" >= 0),
	CONSTRAINT "orders_currency_check" CHECK (char_length("orders"."currency") = 3),
	CONSTRAINT "orders_payment_status_check" CHECK ("orders"."payment_status" in ('pending','success','failed','refunded')),
	CONSTRAINT "orders_fulfilled_requires_success_check" CHECK ((not "orders"."fulfilled") or "orders"."payment_status" = 'success')
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"whatsapp" text,
	"verified" boolean DEFAULT false NOT NULL,
	"otp_code_hash" text,
	"otp_expires_at" timestamp with time zone,
	"otp_attempt_count" integer DEFAULT 0 NOT NULL,
	"otp_last_sent_at" timestamp with time zone,
	"otp_send_count" integer DEFAULT 0 NOT NULL,
	"otp_send_window_start" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_otp_attempt_count_check" CHECK ("users"."otp_attempt_count" >= 0),
	CONSTRAINT "users_otp_send_count_check" CHECK ("users"."otp_send_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_payment_intent_uidx" ON "orders" USING btree ("stripe_payment_intent_id") WHERE "orders"."stripe_payment_intent_id" is not null;--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree (lower("email"));