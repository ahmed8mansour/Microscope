CREATE TABLE "shipping_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"recipient_name" text,
	"phone" text,
	"country" text,
	"state" text,
	"city" text,
	"line1" text,
	"line2" text,
	"postal_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_addresses_country_check" CHECK ("shipping_addresses"."country" is null or char_length("shipping_addresses"."country") = 2)
);
--> statement-breakpoint
ALTER TABLE "shipping_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "supplier_order_ref" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "supplier_tracking_ref" text;--> statement-breakpoint
ALTER TABLE "shipping_addresses" ADD CONSTRAINT "shipping_addresses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_addresses_order_id_uidx" ON "shipping_addresses" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_check" CHECK ("orders"."quantity" >= 1);