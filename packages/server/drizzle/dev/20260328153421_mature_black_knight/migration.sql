ALTER TABLE "orders_services" ADD COLUMN "brand" varchar(255);--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "model" varchar(255);--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "size" varchar(64);
UPDATE "orders_services" SET "brand" = "shoe_brand" WHERE "brand" IS NULL AND "shoe_brand" IS NOT NULL;--> statement-breakpoint
UPDATE "orders_services" SET "size" = "shoe_size" WHERE "size" IS NULL AND "shoe_size" IS NOT NULL;
