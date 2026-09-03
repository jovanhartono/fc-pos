CREATE TYPE "campaign_discount_type_enum" AS ENUM('fixed', 'percentage', 'buy_n_get_m_free');--> statement-breakpoint
CREATE TYPE "campaign_redemption_mode" AS ENUM('listed', 'code');--> statement-breakpoint
CREATE TYPE "cancel_reason_enum" AS ENUM('customer_request', 'cannot_process', 'damaged_intake', 'duplicate_order', 'other');--> statement-breakpoint
CREATE TYPE "discount_source_enum" AS ENUM('none', 'manual', 'campaign');--> statement-breakpoint
CREATE TYPE "order_payment_status" AS ENUM('paid', 'unpaid');--> statement-breakpoint
CREATE TYPE "order_service_status_enum" AS ENUM('queued', 'processing', 'quality_check', 'qc_reject', 'ready_for_pickup', 'picked_up', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "order_status_enum" AS ENUM('created', 'processing', 'ready_for_pickup', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "refund_reason_enum" AS ENUM('damaged', 'cannot_process', 'lost', 'other', 'customer_cancelled');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('admin', 'cashier', 'worker', 'courier');--> statement-breakpoint
CREATE TABLE "campaign_codes" (
	"campaign_id" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"redeemed_at" timestamp with time zone,
	"redeemed_order_id" integer
);
--> statement-breakpoint
CREATE TABLE "campaign_eligible_services" (
	"campaign_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_eligible_services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"service_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_stores" (
	"campaign_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"code" varchar(32) NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"discount_type" "campaign_discount_type_enum" NOT NULL,
	"discount_value" numeric(12,0) DEFAULT '0' NOT NULL,
	"buy_quantity" integer,
	"free_quantity" integer,
	"ends_at" timestamp,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_active" boolean DEFAULT true NOT NULL,
	"max_discount" numeric(12,0),
	"min_order_total" numeric(12,0) DEFAULT '0' NOT NULL,
	"name" varchar(255) NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"redemption_mode" "campaign_redemption_mode" DEFAULT 'listed'::"campaign_redemption_mode" NOT NULL,
	"starts_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer NOT NULL,
	"usage_limit" integer,
	CONSTRAINT "campaign_discount_value_non_negative_check" CHECK ("discount_value" >= 0),
	CONSTRAINT "campaign_min_order_total_non_negative_check" CHECK ("min_order_total" >= 0),
	CONSTRAINT "campaign_max_discount_non_negative_check" CHECK ("max_discount" >= 0),
	CONSTRAINT "campaign_period_valid_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" >= "starts_at"),
	CONSTRAINT "campaign_percentage_discount_limit_check" CHECK ("discount_type" != 'percentage' OR ("discount_value" >= 0 AND "discount_value" <= 100)),
	CONSTRAINT "campaign_bogo_valid_check" CHECK ("discount_type" != 'buy_n_get_m_free'
          OR (
            "buy_quantity" IS NOT NULL
            AND "free_quantity" IS NOT NULL
            AND "buy_quantity" >= 1
            AND "free_quantity" >= 1
          )),
	CONSTRAINT "campaign_redeemed_count_non_negative_check" CHECK ("redeemed_count" >= 0),
	CONSTRAINT "campaign_usage_limit_non_negative_check" CHECK ("usage_limit" IS NULL OR "usage_limit" >= 1),
	CONSTRAINT "campaign_mode_exclusivity_check" CHECK ("redemption_mode" = 'listed' OR "usage_limit" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "complaints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"opened_by" integer NOT NULL,
	"order_service_id" integer NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"email" varchar(255) UNIQUE,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(255) NOT NULL,
	"origin_store_id" integer NOT NULL,
	"phone_number" varchar(16) NOT NULL UNIQUE,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"brand" varchar(255),
	"color" varchar(255),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"item_code" varchar(64) NOT NULL,
	"model" varchar(255),
	"order_id" integer NOT NULL,
	"size" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "order_campaigns" (
	"applied_amount" numeric(12,0) DEFAULT '0' NOT NULL,
	"buy_quantity" integer,
	"campaign_id" integer NOT NULL,
	"code_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"discount_type" "campaign_discount_type_enum" NOT NULL,
	"discount_value" numeric(12,0) DEFAULT '0' NOT NULL,
	"free_quantity" integer,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"max_discount" numeric(12,0),
	"order_id" integer NOT NULL,
	CONSTRAINT "order_campaigns_applied_amount_non_negative_check" CHECK ("applied_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_counters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_counters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_code" varchar(10) NOT NULL,
	"date_str" varchar(8) NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_pickup_events" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_pickup_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"image_path" varchar(512) NOT NULL,
	"order_id" integer NOT NULL,
	"picked_up_at" timestamp DEFAULT now() NOT NULL,
	"picked_up_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_refund_items" (
	"amount" numeric(12,0) DEFAULT '0' NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_refund_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"note" text,
	"order_product_id" integer,
	"order_refund_id" integer NOT NULL,
	"order_service_id" integer,
	"reason" "refund_reason_enum" NOT NULL,
	CONSTRAINT "order_refund_items_amount_non_negative_check" CHECK ("amount" >= 0),
	CONSTRAINT "order_refund_items_line_xor_check" CHECK (("order_service_id" IS NULL) != ("order_product_id" IS NULL)),
	CONSTRAINT "order_refund_items_other_reason_requires_note_check" CHECK ("reason" != 'other' OR ("note" IS NOT NULL AND LENGTH(TRIM("note")) > 0))
);
--> statement-breakpoint
CREATE TABLE "order_refunds" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_refunds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"refunded_by" integer NOT NULL,
	"total_amount" numeric(12,0) DEFAULT '0' NOT NULL,
	CONSTRAINT "order_refunds_total_amount_non_negative_check" CHECK ("total_amount" >= 0)
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
CREATE TABLE "order_service_price_logs" (
	"changed_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"from_price" numeric(12,0),
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_service_price_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_service_id" integer NOT NULL,
	"to_price" numeric(12,0) NOT NULL
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
CREATE TABLE "order_services_images" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" integer,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_services_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"image_path" varchar(512) NOT NULL,
	"note" text,
	"order_service_id" integer,
	"uploaded_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"discount" numeric(12,0) DEFAULT '0' NOT NULL,
	"order_id" integer,
	"price" numeric(12,0) DEFAULT '0',
	"cogs_snapshot" numeric(12,0) DEFAULT '0' NOT NULL,
	"product_id" integer,
	"qty" smallint DEFAULT 1 NOT NULL,
	"refunded_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" "cancel_reason_enum",
	"cancel_note" text,
	"subtotal" numeric(12,0) GENERATED ALWAYS AS (("orders_products"."price" * "orders_products"."qty") - "orders_products"."discount") STORED,
	CONSTRAINT "price_non_negative_check" CHECK ("price" >= 0),
	CONSTRAINT "qty_positive_check" CHECK ("qty" > 0),
	CONSTRAINT "discount_valid_check" CHECK (("price" * "qty") >= "discount"),
	CONSTRAINT "order_products_cancel_refund_xor_check" CHECK ("cancelled_at" IS NULL OR "refunded_at" IS NULL),
	CONSTRAINT "order_products_cancel_reason_required_check" CHECK ("cancelled_at" IS NULL OR "cancel_reason" IS NOT NULL),
	CONSTRAINT "order_products_cancel_other_reason_requires_note_check" CHECK ("cancel_reason" != 'other' OR ("cancel_note" IS NOT NULL AND LENGTH(TRIM("cancel_note")) > 0))
);
--> statement-breakpoint
CREATE TABLE "orders_services" (
	"discount" numeric(12,0) DEFAULT '0' NOT NULL,
	"cancel_reason" "cancel_reason_enum",
	"cancel_note" text,
	"complaint_id" integer,
	"handler_id" integer,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_priority" boolean DEFAULT false NOT NULL,
	"item_id" integer NOT NULL,
	"notes" text,
	"order_id" integer NOT NULL,
	"pickup_event_id" integer,
	"price" numeric(12,0),
	"cogs_snapshot" numeric(12,0) DEFAULT '0' NOT NULL,
	"service_id" integer,
	"status" "order_service_status_enum" DEFAULT 'queued'::"order_service_status_enum" NOT NULL,
	"subtotal" numeric(12,0) GENERATED ALWAYS AS ("orders_services"."price" - "orders_services"."discount") STORED,
	CONSTRAINT "price_non_negative_check" CHECK ("price" IS NULL OR "price" >= 0),
	CONSTRAINT "discount_valid_check" CHECK ("price" >= "discount"),
	CONSTRAINT "order_services_pickup_event_terminal_check" CHECK ("pickup_event_id" IS NULL OR "status" IN ('picked_up', 'refunded')),
	CONSTRAINT "order_services_picked_up_requires_event_check" CHECK ("status" != 'picked_up' OR "pickup_event_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"cancelled_at" timestamp,
	"code" varchar(32) NOT NULL UNIQUE,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"collected_by" integer,
	"created_by" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"dropoff_photo_path" varchar(512),
	"dropoff_photo_uploaded_at" timestamp,
	"dropoff_photo_uploaded_by" integer,
	"discount_source" "discount_source_enum" DEFAULT 'none'::"discount_source_enum" NOT NULL,
	"discount" numeric(12,0) DEFAULT '0' NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"notes" text,
	"payment_method_id" integer,
	"payment_status" "order_payment_status" DEFAULT 'unpaid'::"order_payment_status" NOT NULL,
	"paid_amount" numeric(12,0) DEFAULT '0' NOT NULL,
	"paid_at" timestamp,
	"paid_by" integer,
	"pickup_code" varchar(6) DEFAULT lpad((floor((random() * (1000000)::double precision)))::text, 6, '0'::text) NOT NULL,
	"ready_at" timestamp,
	"refunded_amount" numeric(12,0) DEFAULT '0' NOT NULL,
	"status" "order_status_enum" DEFAULT 'created'::"order_status_enum" NOT NULL,
	"store_id" integer NOT NULL,
	"total" numeric(12,0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer NOT NULL,
	CONSTRAINT "total_non_negative_check" CHECK ("total" >= 0),
	CONSTRAINT "paid_amount_non_negative_check" CHECK ("paid_amount" >= 0),
	CONSTRAINT "refunded_amount_non_negative_check" CHECK ("refunded_amount" >= 0),
	CONSTRAINT "discount_non_negative_check" CHECK ("discount" >= 0),
	CONSTRAINT "discount_valid_check" CHECK (("total") >= "discount"),
	CONSTRAINT "paid_amount_valid_check" CHECK ("paid_amount" <= "total"),
	CONSTRAINT "refunded_amount_valid_check" CHECK ("refunded_amount" <= "paid_amount")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"code" varchar(6) NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_methods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_active" boolean DEFAULT false NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"category_id" integer NOT NULL,
	"cogs" numeric(12,0) DEFAULT '0' NOT NULL,
	"price" numeric(12,0) DEFAULT '0' NOT NULL,
	"description" text,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_active" boolean DEFAULT false NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(255) NOT NULL UNIQUE,
	"stock" integer DEFAULT 0 NOT NULL,
	"uom" varchar(12) DEFAULT 'pcs' NOT NULL,
	CONSTRAINT "stock_non_negative_check" CHECK ("stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"category_id" integer NOT NULL,
	"code" varchar(4) NOT NULL UNIQUE,
	"cogs" numeric(12,0) DEFAULT '0' NOT NULL,
	"price" numeric(12,0),
	"description" text,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_active" boolean DEFAULT false NOT NULL,
	"is_priority" boolean DEFAULT false NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "code_len_check" CHECK (LENGTH(TRIM("code")) >= 1 AND LENGTH(TRIM("code")) <= 4)
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"clock_in_at" timestamp DEFAULT now() NOT NULL,
	"clock_out_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shifts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "shifts_clock_out_after_clock_in_check" CHECK ("clock_out_at" IS NULL OR "clock_out_at" >= "clock_in_at")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"address" varchar(255) NOT NULL,
	"code" varchar(3) NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_active" boolean DEFAULT false NOT NULL,
	"latitude" numeric(11,8) NOT NULL,
	"longitude" numeric(11,8) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone_number" varchar(16) NOT NULL UNIQUE,
	CONSTRAINT "code_len_check" CHECK (LENGTH(TRIM("code")) = 3)
);
--> statement-breakpoint
CREATE TABLE "user_stores" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"can_process_pickup" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"is_active" boolean DEFAULT true NOT NULL,
	"name" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" varchar(255) NOT NULL UNIQUE,
	CONSTRAINT "username_len-check" CHECK (LENGTH(TRIM("username")) >= 5)
);
--> statement-breakpoint
CREATE INDEX "campaign_codes_campaign_idx" ON "campaign_codes" ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_codes_redeemed_at_idx" ON "campaign_codes" ("redeemed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_codes_code_uidx" ON "campaign_codes" ("code");--> statement-breakpoint
CREATE INDEX "campaign_eligible_services_campaign_idx" ON "campaign_eligible_services" ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_eligible_services_service_idx" ON "campaign_eligible_services" ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_eligible_services_campaign_service_uidx" ON "campaign_eligible_services" ("campaign_id","service_id");--> statement-breakpoint
CREATE INDEX "campaign_stores_campaign_idx" ON "campaign_stores" ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_stores_store_idx" ON "campaign_stores" ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_stores_campaign_store_uidx" ON "campaign_stores" ("campaign_id","store_id");--> statement-breakpoint
CREATE INDEX "campaign_code_idx" ON "campaigns" ("code");--> statement-breakpoint
CREATE INDEX "campaign_name_idx" ON "campaigns" ("name");--> statement-breakpoint
CREATE INDEX "campaign_active_idx" ON "campaigns" ("is_active");--> statement-breakpoint
CREATE INDEX "complaints_opened_by_idx" ON "complaints" ("opened_by");--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_order_service_uidx" ON "complaints" ("order_service_id");--> statement-breakpoint
CREATE INDEX "customer_name_idx" ON "customers" ("name");--> statement-breakpoint
CREATE INDEX "customer_phone_idx" ON "customers" ("phone_number");--> statement-breakpoint
CREATE INDEX "items_order_idx" ON "items" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_item_code_uidx" ON "items" ("item_code");--> statement-breakpoint
CREATE UNIQUE INDEX "items_order_id_id_uidx" ON "items" ("order_id","id");--> statement-breakpoint
CREATE INDEX "order_campaigns_order_idx" ON "order_campaigns" ("order_id");--> statement-breakpoint
CREATE INDEX "order_campaigns_campaign_idx" ON "order_campaigns" ("campaign_id");--> statement-breakpoint
CREATE INDEX "order_campaigns_code_idx" ON "order_campaigns" ("code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_campaigns_order_campaign_uidx" ON "order_campaigns" ("order_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_counter_store_date_uidx" ON "order_counters" ("store_code","date_str");--> statement-breakpoint
CREATE INDEX "order_pickup_events_order_idx" ON "order_pickup_events" ("order_id");--> statement-breakpoint
CREATE INDEX "order_pickup_events_picked_up_by_idx" ON "order_pickup_events" ("picked_up_by");--> statement-breakpoint
CREATE INDEX "order_refund_items_refund_idx" ON "order_refund_items" ("order_refund_id");--> statement-breakpoint
CREATE INDEX "order_refund_items_service_idx" ON "order_refund_items" ("order_service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_refund_items_product_uidx" ON "order_refund_items" ("order_product_id") WHERE "order_product_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "order_refunds_order_idx" ON "order_refunds" ("order_id");--> statement-breakpoint
CREATE INDEX "order_refunds_refunded_by_idx" ON "order_refunds" ("refunded_by");--> statement-breakpoint
CREATE INDEX "order_service_handler_logs_service_idx" ON "order_service_handler_logs" ("order_service_id");--> statement-breakpoint
CREATE INDEX "order_service_handler_logs_changed_by_idx" ON "order_service_handler_logs" ("changed_by");--> statement-breakpoint
CREATE INDEX "order_service_price_logs_service_idx" ON "order_service_price_logs" ("order_service_id");--> statement-breakpoint
CREATE INDEX "order_service_price_logs_changed_by_idx" ON "order_service_price_logs" ("changed_by");--> statement-breakpoint
CREATE INDEX "order_service_status_logs_service_idx" ON "order_service_status_logs" ("order_service_id");--> statement-breakpoint
CREATE INDEX "order_service_status_logs_changed_by_idx" ON "order_service_status_logs" ("changed_by");--> statement-breakpoint
CREATE INDEX "order_service_status_logs_processing_idx" ON "order_service_status_logs" ("to_status","from_status","created_at") WHERE "to_status" = 'processing';--> statement-breakpoint
CREATE INDEX "order_services_images_deleted_at_idx" ON "order_services_images" ("deleted_at");--> statement-breakpoint
CREATE INDEX "order_services_images_service_idx" ON "order_services_images" ("order_service_id");--> statement-breakpoint
CREATE INDEX "order_products_order_idx" ON "orders_products" ("order_id");--> statement-breakpoint
CREATE INDEX "order_products_product_idx" ON "orders_products" ("product_id");--> statement-breakpoint
CREATE INDEX "order_products_order_product_idx" ON "orders_products" ("order_id","product_id");--> statement-breakpoint
CREATE INDEX "order_services_order_idx" ON "orders_services" ("order_id");--> statement-breakpoint
CREATE INDEX "order_services_service_idx" ON "orders_services" ("service_id");--> statement-breakpoint
CREATE INDEX "order_services_order_service_idx" ON "orders_services" ("order_id","service_id");--> statement-breakpoint
CREATE INDEX "order_services_handler_status_idx" ON "orders_services" ("handler_id","status");--> statement-breakpoint
CREATE INDEX "order_services_priority_idx" ON "orders_services" ("is_priority");--> statement-breakpoint
CREATE INDEX "order_services_item_idx" ON "orders_services" ("item_id");--> statement-breakpoint
CREATE INDEX "order_services_pickup_event_idx" ON "orders_services" ("pickup_event_id");--> statement-breakpoint
CREATE INDEX "order_services_complaint_idx" ON "orders_services" ("complaint_id");--> statement-breakpoint
CREATE INDEX "order_store_idx" ON "orders" ("store_id");--> statement-breakpoint
CREATE INDEX "order_store_created_at_idx" ON "orders" ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "order_customer_idx" ON "orders" ("customer_id");--> statement-breakpoint
CREATE INDEX "order_payment_status_idx" ON "orders" ("payment_status");--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX "order_created_at_idx" ON "orders" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_code_idx" ON "orders" ("code");--> statement-breakpoint
CREATE INDEX "product_name_idx" ON "products" ("name");--> statement-breakpoint
CREATE INDEX "service_name_idx" ON "services" ("name");--> statement-breakpoint
CREATE INDEX "service_code_idx" ON "services" ("code");--> statement-breakpoint
CREATE INDEX "service_priority_idx" ON "services" ("is_priority");--> statement-breakpoint
CREATE INDEX "shifts_user_clock_in_idx" ON "shifts" ("user_id","clock_in_at");--> statement-breakpoint
CREATE INDEX "shifts_store_clock_in_idx" ON "shifts" ("store_id","clock_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_user_open_uidx" ON "shifts" ("user_id") WHERE "clock_out_at" IS NULL;--> statement-breakpoint
CREATE INDEX "user_stores_user_idx" ON "user_stores" ("user_id");--> statement-breakpoint
CREATE INDEX "user_stores_store_idx" ON "user_stores" ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_stores_user_store_uidx" ON "user_stores" ("user_id","store_id");--> statement-breakpoint
ALTER TABLE "campaign_codes" ADD CONSTRAINT "campaign_codes_campaign_id_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_codes" ADD CONSTRAINT "campaign_codes_redeemed_order_id_orders_id_fkey" FOREIGN KEY ("redeemed_order_id") REFERENCES "orders"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "campaign_eligible_services" ADD CONSTRAINT "campaign_eligible_services_campaign_id_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_eligible_services" ADD CONSTRAINT "campaign_eligible_services_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_stores" ADD CONSTRAINT "campaign_stores_campaign_id_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaign_stores" ADD CONSTRAINT "campaign_stores_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_opened_by_users_id_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_service_id_orders_services_id_fkey" FOREIGN KEY ("order_service_id") REFERENCES "orders_services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_origin_store_id_stores_id_fkey" FOREIGN KEY ("origin_store_id") REFERENCES "stores"("id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_campaigns" ADD CONSTRAINT "order_campaigns_campaign_id_campaigns_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "order_campaigns" ADD CONSTRAINT "order_campaigns_code_id_campaign_codes_id_fkey" FOREIGN KEY ("code_id") REFERENCES "campaign_codes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "order_campaigns" ADD CONSTRAINT "order_campaigns_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_pickup_events" ADD CONSTRAINT "order_pickup_events_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_pickup_events" ADD CONSTRAINT "order_pickup_events_picked_up_by_users_id_fkey" FOREIGN KEY ("picked_up_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_order_product_id_orders_products_id_fkey" FOREIGN KEY ("order_product_id") REFERENCES "orders_products"("id");--> statement-breakpoint
ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_order_refund_id_order_refunds_id_fkey" FOREIGN KEY ("order_refund_id") REFERENCES "order_refunds"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_refund_items" ADD CONSTRAINT "order_refund_items_order_service_id_orders_services_id_fkey" FOREIGN KEY ("order_service_id") REFERENCES "orders_services"("id");--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_refunded_by_users_id_fkey" FOREIGN KEY ("refunded_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_changed_by_users_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_from_handler_id_users_id_fkey" FOREIGN KEY ("from_handler_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_QAiXQOD38g0b_fkey" FOREIGN KEY ("order_service_id") REFERENCES "orders_services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_service_handler_logs" ADD CONSTRAINT "order_service_handler_logs_to_handler_id_users_id_fkey" FOREIGN KEY ("to_handler_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_service_price_logs" ADD CONSTRAINT "order_service_price_logs_changed_by_users_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_service_price_logs" ADD CONSTRAINT "order_service_price_logs_RqiHpBHy29ik_fkey" FOREIGN KEY ("order_service_id") REFERENCES "orders_services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_service_status_logs" ADD CONSTRAINT "order_service_status_logs_changed_by_users_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_service_status_logs" ADD CONSTRAINT "order_service_status_logs_FEWhCzqFDOvj_fkey" FOREIGN KEY ("order_service_id") REFERENCES "orders_services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_services_images" ADD CONSTRAINT "order_services_images_deleted_by_users_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "order_services_images" ADD CONSTRAINT "order_services_images_order_service_id_orders_services_id_fkey" FOREIGN KEY ("order_service_id") REFERENCES "orders_services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_services_images" ADD CONSTRAINT "order_services_images_uploaded_by_users_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "orders_products" ADD CONSTRAINT "orders_products_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders_products" ADD CONSTRAINT "orders_products_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_complaint_id_complaints_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_handler_id_users_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_pickup_event_id_order_pickup_events_id_fkey" FOREIGN KEY ("pickup_event_id") REFERENCES "order_pickup_events"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "order_services_order_item_fk" FOREIGN KEY ("order_id","item_id") REFERENCES "items"("order_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_collected_by_users_id_fkey" FOREIGN KEY ("collected_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_dropoff_photo_uploaded_by_users_id_fkey" FOREIGN KEY ("dropoff_photo_uploaded_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_id_payment_methods_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_by_users_id_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id");--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_store_id_stores_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_stores" ADD CONSTRAINT "user_stores_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;