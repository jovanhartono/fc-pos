CREATE TYPE "public"."order_status_enum" AS ENUM('created', 'processing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "order_services_images" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_services_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_service_id" integer,
	"image_url" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "orders_products" DROP COLUMN "subtotal";--> statement-breakpoint
ALTER TABLE "orders_services" DROP COLUMN "subtotal";
--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "id" SET GENERATED ALWAYS;--> statement-breakpoint
ALTER TABLE "orders_products" ALTER COLUMN "qty" SET DATA TYPE smallint;--> statement-breakpoint
ALTER TABLE "orders_products" ALTER COLUMN "qty" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "orders_services" ALTER COLUMN "qty" SET DATA TYPE smallint;--> statement-breakpoint
ALTER TABLE "orders_services" ALTER COLUMN "qty" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "store_service_prices" ALTER COLUMN "price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "updated_by" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "handler_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "status" "order_status_enum" DEFAULT 'created' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "order_services_images" ADD CONSTRAINT "order_services_images_order_service_id_orders_services_id_fk" FOREIGN KEY ("order_service_id") REFERENCES "public"."orders_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_handler_id_users_id_fk" FOREIGN KEY ("handler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint