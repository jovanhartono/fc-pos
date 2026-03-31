ALTER TABLE "store_service_prices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "store_service_prices" CASCADE;--> statement-breakpoint
ALTER TABLE "orders_products" ALTER COLUMN "discount" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "orders_products" ALTER COLUMN "discount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price" numeric(12) NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "price" numeric(12);