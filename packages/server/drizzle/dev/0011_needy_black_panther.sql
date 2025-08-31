ALTER TABLE "orders_products" DROP COLUMN "subtotal";
ALTER TABLE "orders_services" DROP COLUMN "subtotal";
ALTER TABLE "orders_products" ALTER COLUMN "price" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "orders_products" ALTER COLUMN "price" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders_products" ADD COLUMN "subtotal" numeric GENERATED ALWAYS AS (price * qty) STORED;
ALTER TABLE "orders_services" ALTER COLUMN "discount" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "orders_services" ALTER COLUMN "discount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders_services" ALTER COLUMN "price" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "orders_services" ALTER COLUMN "price" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "subtotal" numeric GENERATED ALWAYS AS (price * qty) STORED;
ALTER TABLE "orders" ALTER COLUMN "discount" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "discount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "cogs" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "cogs" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "cogs" SET DATA TYPE numeric(12);--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "cogs" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "store_service_prices" ALTER COLUMN "price" SET DATA TYPE numeric(12);