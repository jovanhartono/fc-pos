ALTER TABLE "orders_services" DROP CONSTRAINT "qty_positive_check";--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "discount_valid_check";--> statement-breakpoint
ALTER TABLE "orders_services" drop column "subtotal";--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "subtotal" numeric(12) GENERATED ALWAYS AS ("orders_services"."price" - "orders_services"."discount") STORED;--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "color" varchar(255);--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "discount_valid_check" CHECK ("orders_services"."price" >= "orders_services"."discount");