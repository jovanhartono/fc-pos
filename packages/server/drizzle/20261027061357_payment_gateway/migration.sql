CREATE TYPE "payment_charge_kind" AS ENUM('qris', 'checkout');--> statement-breakpoint
CREATE TYPE "payment_charge_status" AS ENUM('pending', 'paid', 'expired', 'cancelled', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "payment_gateway" AS ENUM('midtrans', 'doku');--> statement-breakpoint
CREATE TABLE "payment_charges" (
	"amount" numeric(12,0) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"discount_request" jsonb,
	"expires_at" timestamp NOT NULL,
	"gateway" "payment_gateway" NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_charges_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "payment_charge_kind" NOT NULL,
	"last_payload" jsonb,
	"order_id" integer NOT NULL,
	"paid_at" timestamp,
	"provider_ref" varchar(255),
	"qr_image_url" text,
	"redirect_url" text,
	"reference" varchar(50) NOT NULL UNIQUE,
	"review_reason" text,
	"status" "payment_charge_status" DEFAULT 'pending'::"payment_charge_status" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "gateway" "payment_gateway";--> statement-breakpoint
CREATE INDEX "payment_charges_order_status_idx" ON "payment_charges" ("order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_gateway_uidx" ON "payment_methods" ("gateway") WHERE "gateway" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id");