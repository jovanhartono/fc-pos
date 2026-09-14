CREATE TYPE "intake_channel_enum" AS ENUM('walk_in', 'courier', 'shipped');--> statement-breakpoint
CREATE TABLE "postal_codes" (
	"city" varchar(64) NOT NULL,
	"code" varchar(5) PRIMARY KEY,
	"districts" varchar(255) NOT NULL,
	"province" varchar(32) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "intake_channel" "intake_channel_enum" DEFAULT 'walk_in'::"intake_channel_enum" NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "origin_postal_code" varchar(5);--> statement-breakpoint
CREATE INDEX "postal_code_city_idx" ON "postal_codes" ("city");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_origin_postal_code_postal_codes_code_fkey" FOREIGN KEY ("origin_postal_code") REFERENCES "postal_codes"("code");--> statement-breakpoint
-- Backfill before the CHECK, or every order a courier collected fails it: the
-- column default calls all of them walk-ins. Hand-written per ADR-0020.
UPDATE "orders" SET "intake_channel" = 'courier' WHERE "collected_by" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "intake_channel_courier_check" CHECK (("intake_channel" = 'courier') = ("collected_by" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "walk_in_has_no_origin_check" CHECK ("intake_channel" <> 'walk_in' OR "origin_postal_code" IS NULL);