ALTER TABLE "orders" ADD COLUMN "delivery_fee" numeric(12,0) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "delivery_fee_non_negative_check" CHECK ("delivery_fee" >= 0);--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "paid_amount_valid_check", ADD CONSTRAINT "paid_amount_valid_check" CHECK ("paid_amount" <= "total" + "delivery_fee");