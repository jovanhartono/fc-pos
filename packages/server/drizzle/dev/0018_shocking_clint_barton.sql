CREATE TYPE "public"."campaign_discount_type_enum" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."discount_source_enum" AS ENUM('none', 'manual', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."order_service_photo_type_enum" AS ENUM('dropoff', 'progress', 'pickup', 'refund');--> statement-breakpoint
CREATE TYPE "public"."order_service_status_enum" AS ENUM('received', 'queued', 'processing', 'quality_check', 'ready_for_pickup', 'picked_up', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."refund_reason_enum" AS ENUM('damaged', 'cannot_process', 'lost', 'other');--> statement-breakpoint
CREATE TABLE "campaign_stores" (
	"campaign_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"code" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"discount_type" "campaign_discount_type_enum" NOT NULL,
	"discount_value" numeric(12) DEFAULT '0' NOT NULL,
	"ends_at" timestamp,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_active" boolean DEFAULT true NOT NULL,
	"max_discount" numeric(12),
	"min_order_total" numeric(12) DEFAULT '0' NOT NULL,
	"name" varchar(255) NOT NULL,
	"starts_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer NOT NULL,
	CONSTRAINT "campaigns_code_unique" UNIQUE("code"),
	CONSTRAINT "campaign_discount_value_non_negative_check" CHECK ("campaigns"."discount_value" >= 0),
	CONSTRAINT "campaign_min_order_total_non_negative_check" CHECK ("campaigns"."min_order_total" >= 0),
	CONSTRAINT "campaign_max_discount_non_negative_check" CHECK ("campaigns"."max_discount" >= 0),
	CONSTRAINT "campaign_period_valid_check" CHECK ("campaigns"."ends_at" IS NULL OR "campaigns"."starts_at" IS NULL OR "campaigns"."ends_at" >= "campaigns"."starts_at"),
	CONSTRAINT "campaign_percentage_discount_limit_check" CHECK ("campaigns"."discount_type" != 'percentage' OR ("campaigns"."discount_value" >= 0 AND "campaigns"."discount_value" <= 100))
);
--> statement-breakpoint
CREATE TABLE "order_refund_items" (
	"amount" numeric(12) DEFAULT '0' NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_refund_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"note" text,
	"order_refund_id" integer NOT NULL,
	"order_service_id" integer NOT NULL,
	"reason" "refund_reason_enum" NOT NULL,
	CONSTRAINT "order_refund_items_amount_non_negative_check" CHECK ("order_refund_items"."amount" >= 0),
	CONSTRAINT "order_refund_items_other_reason_requires_note_check" CHECK ("order_refund_items"."reason" != 'other' OR ("order_refund_items"."note" IS NOT NULL AND LENGTH(TRIM("order_refund_items"."note")) > 0))
);
--> statement-breakpoint
CREATE TABLE "order_refunds" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_refunds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"note" text,
	"order_id" integer NOT NULL,
	"refunded_by" integer NOT NULL,
	"total_amount" numeric(12) DEFAULT '0' NOT NULL,
	CONSTRAINT "order_refunds_total_amount_non_negative_check" CHECK ("order_refunds"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_service_handler_logs" (
	"changed_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"from_handler_id" integer,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_service_handler_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"note" text,
	"order_service_id" integer NOT NULL,
	"to_handler_id" integer
);
--> statement-breakpoint
CREATE TABLE "order_service_status_logs" (
	"changed_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"from_status" "order_service_status_enum",
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_service_status_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"note" text,
	"order_service_id" integer NOT NULL,
	"to_status" "order_service_status_enum" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stores" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'unpaid'::text;--> statement-breakpoint
UPDATE "orders" SET "payment_status" = 'unpaid' WHERE "payment_status" = 'partial';--> statement-breakpoint
DROP TYPE "public"."order_payment_status";--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('paid', 'unpaid');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'unpaid'::"public"."order_payment_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DATA TYPE "public"."order_payment_status" USING "payment_status"::"public"."order_payment_status";--> statement-breakpoint
ALTER TABLE "order_services_images" ADD COLUMN "photo_type" "order_service_photo_type_enum" DEFAULT 'progress' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_services_images" ADD COLUMN "s3_key" varchar(512) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_services_images" ADD COLUMN "uploaded_by" integer;--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "item_code" varchar(64);--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "shoe_brand" varchar(255);--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "shoe_size" varchar(64);--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "status" "order_service_status_enum" DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "campaign_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_source" "discount_source_enum" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_amount" numeric(12) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_amount" numeric(12) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_stores" ADD CONSTRAINT "campaign_stores_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_stores" ADD CONSTRAINT "campaign_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_order_refund_id_order_refunds_id_fk" FOREIGN KEY ("order_refund_id") REFERENCES "public"."order_refunds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_order_service_id_orders_services_id_fk" FOREIGN KEY ("order_service_id") REFERENCES "public"."orders_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_from_handler_id_users_id_fk" FOREIGN KEY ("from_handler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_order_service_id_orders_services_id_fk" FOREIGN KEY ("order_service_id") REFERENCES "public"."orders_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_to_handler_id_users_id_fk" FOREIGN KEY ("to_handler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_status_logs" ADD CONSTRAINT "order_service_status_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_service_status_logs" ADD CONSTRAINT "order_service_status_logs_order_service_id_orders_services_id_fk" FOREIGN KEY ("order_service_id") REFERENCES "public"."orders_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_stores_campaign_idx" ON "campaign_stores" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_stores_store_idx" ON "campaign_stores" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_stores_campaign_store_uidx" ON "campaign_stores" USING btree ("campaign_id","store_id");--> statement-breakpoint
CREATE INDEX "campaign_code_idx" ON "campaigns" USING btree ("code");--> statement-breakpoint
CREATE INDEX "campaign_name_idx" ON "campaigns" USING btree ("name");--> statement-breakpoint
CREATE INDEX "campaign_active_idx" ON "campaigns" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "order_refund_items_refund_idx" ON "order_refund_items" USING btree ("order_refund_id");--> statement-breakpoint
CREATE INDEX "order_refund_items_service_idx" ON "order_refund_items" USING btree ("order_service_id");--> statement-breakpoint
CREATE INDEX "order_refunds_order_idx" ON "order_refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_refunds_refunded_by_idx" ON "order_refunds" USING btree ("refunded_by");--> statement-breakpoint
CREATE INDEX "order_service_handler_logs_service_idx" ON "order_service_handler_logs" USING btree ("order_service_id");--> statement-breakpoint
CREATE INDEX "order_service_handler_logs_changed_by_idx" ON "order_service_handler_logs" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "order_service_status_logs_service_idx" ON "order_service_status_logs" USING btree ("order_service_id");--> statement-breakpoint
CREATE INDEX "order_service_status_logs_changed_by_idx" ON "order_service_status_logs" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "user_stores_user_idx" ON "user_stores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_stores_store_idx" ON "user_stores" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_stores_user_store_uidx" ON "user_stores" USING btree ("user_id","store_id");--> statement-breakpoint
ALTER TABLE "order_services_images" ADD CONSTRAINT "order_services_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_services_handler_status_idx" ON "orders_services" USING btree ("handler_id","status");--> statement-breakpoint
CREATE INDEX "order_services_item_code_idx" ON "orders_services" USING btree ("item_code");--> statement-breakpoint
CREATE UNIQUE INDEX "order_services_item_code_uidx" ON "orders_services" USING btree ("item_code");--> statement-breakpoint
CREATE INDEX "order_campaign_idx" ON "orders" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "paid_amount_non_negative_check" CHECK ("orders"."paid_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "refunded_amount_non_negative_check" CHECK ("orders"."refunded_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "paid_amount_valid_check" CHECK ("orders"."paid_amount" <= "orders"."total");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "refunded_amount_valid_check" CHECK ("orders"."refunded_amount" <= "orders"."paid_amount");
