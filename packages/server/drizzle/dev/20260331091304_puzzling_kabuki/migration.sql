ALTER TABLE "campaigns" DROP CONSTRAINT "campaign_discount_value_non_negative_check", ADD CONSTRAINT "campaign_discount_value_non_negative_check" CHECK ("discount_value" >= 0);--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaign_min_order_total_non_negative_check", ADD CONSTRAINT "campaign_min_order_total_non_negative_check" CHECK ("min_order_total" >= 0);--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaign_max_discount_non_negative_check", ADD CONSTRAINT "campaign_max_discount_non_negative_check" CHECK ("max_discount" >= 0);--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaign_period_valid_check", ADD CONSTRAINT "campaign_period_valid_check" CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" >= "starts_at");--> statement-breakpoint
ALTER TABLE "campaigns" DROP CONSTRAINT "campaign_percentage_discount_limit_check", ADD CONSTRAINT "campaign_percentage_discount_limit_check" CHECK ("discount_type" != 'percentage' OR ("discount_value" >= 0 AND "discount_value" <= 100));--> statement-breakpoint
ALTER TABLE "order_refund_items" DROP CONSTRAINT "order_refund_items_amount_non_negative_check", ADD CONSTRAINT "order_refund_items_amount_non_negative_check" CHECK ("amount" >= 0);--> statement-breakpoint
ALTER TABLE "order_refund_items" DROP CONSTRAINT "order_refund_items_other_reason_requires_note_check", ADD CONSTRAINT "order_refund_items_other_reason_requires_note_check" CHECK ("reason" != 'other' OR ("note" IS NOT NULL AND LENGTH(TRIM("note")) > 0));--> statement-breakpoint
ALTER TABLE "order_refunds" DROP CONSTRAINT "order_refunds_total_amount_non_negative_check", ADD CONSTRAINT "order_refunds_total_amount_non_negative_check" CHECK ("total_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "price_non_negative_check", ADD CONSTRAINT "price_non_negative_check" CHECK ("price" >= 0);--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "qty_positive_check", ADD CONSTRAINT "qty_positive_check" CHECK ("qty" > 0);--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "discount_valid_check", ADD CONSTRAINT "discount_valid_check" CHECK (("price" * "qty") >= "discount");--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "price_non_negative_check", ADD CONSTRAINT "price_non_negative_check" CHECK ("price" >= 0);--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "discount_valid_check", ADD CONSTRAINT "discount_valid_check" CHECK ("price" >= "discount");--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "total_non_negative_check", ADD CONSTRAINT "total_non_negative_check" CHECK ("total" >= 0);--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "paid_amount_non_negative_check", ADD CONSTRAINT "paid_amount_non_negative_check" CHECK ("paid_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "refunded_amount_non_negative_check", ADD CONSTRAINT "refunded_amount_non_negative_check" CHECK ("refunded_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "discount_non_negative_check", ADD CONSTRAINT "discount_non_negative_check" CHECK ("discount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "discount_valid_check", ADD CONSTRAINT "discount_valid_check" CHECK (("total") >= "discount");--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "paid_amount_valid_check", ADD CONSTRAINT "paid_amount_valid_check" CHECK ("paid_amount" <= "total");--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "refunded_amount_valid_check", ADD CONSTRAINT "refunded_amount_valid_check" CHECK ("refunded_amount" <= "paid_amount");--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "stock_non_negative_check", ADD CONSTRAINT "stock_non_negative_check" CHECK ("stock" >= 0);--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT "code_len_check", ADD CONSTRAINT "code_len_check" CHECK (LENGTH(TRIM("code")) >= 1 AND LENGTH(TRIM("code")) <= 4);--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "code_len_check", ADD CONSTRAINT "code_len_check" CHECK (LENGTH(TRIM("code")) = 3);--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "username_len-check", ADD CONSTRAINT "username_len-check" CHECK (LENGTH(TRIM("username")) >= 5);