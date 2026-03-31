ALTER TABLE "orders" DROP CONSTRAINT "total_non_negative_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "discount_non_negative_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "discount_valid_check";--> statement-breakpoint
ALTER TABLE "stores" DROP CONSTRAINT "code_len_check";--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT "code_len_check";--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "price_non_negative_check";--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "qty_positive_check";--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "discount_valid_check";--> statement-breakpoint
ALTER TABLE "store_service_prices" DROP CONSTRAINT "price_non_negative_check";--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "price_non_negative_check";--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "qty_positive_check";--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "discount_valid_check";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "stock_non_negative_check";--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "orders_services_table_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "orders_services" DROP CONSTRAINT "orders_services_table_service_id_services_id_fk";
--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "orders_products_table_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "orders_products" DROP CONSTRAINT "orders_products_table_product_id_products_id_fk";
--> statement-breakpoint
DROP INDEX "customer_name_idx";--> statement-breakpoint
DROP INDEX "customer_phone_idx";--> statement-breakpoint
DROP INDEX "order_code_idx";--> statement-breakpoint
DROP INDEX "order_customer_idx";--> statement-breakpoint
DROP INDEX "order_payment_status_idx";--> statement-breakpoint
DROP INDEX "order_store_idx";--> statement-breakpoint
DROP INDEX "service_code_idx";--> statement-breakpoint
DROP INDEX "service_name_idx";--> statement-breakpoint
DROP INDEX "order_services_order_idx";--> statement-breakpoint
DROP INDEX "order_services_order_service_idx";--> statement-breakpoint
DROP INDEX "order_services_service_idx";--> statement-breakpoint
DROP INDEX "store_service_idx";--> statement-breakpoint
DROP INDEX "order_products_order_idx";--> statement-breakpoint
DROP INDEX "order_products_order_product_idx";--> statement-breakpoint
DROP INDEX "order_products_product_idx";--> statement-breakpoint
DROP INDEX "product_name_idx";--> statement-breakpoint
ALTER TABLE "orders_services" drop column "subtotal";--> statement-breakpoint
ALTER TABLE "orders_services" ADD COLUMN "subtotal" numeric(12, 2) GENERATED ALWAYS AS (("orders_services"."price" * "orders_services"."qty") - "orders_services"."discount") STORED;--> statement-breakpoint
ALTER TABLE "orders_products" drop column "subtotal";--> statement-breakpoint
ALTER TABLE "orders_products" ADD COLUMN "subtotal" numeric(12, 2) GENERATED ALWAYS AS (("orders_products"."price" * "orders_products"."qty") - "orders_products"."discount") STORED;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "orders_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_products" ADD CONSTRAINT "orders_products_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_products" ADD CONSTRAINT "orders_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "customer_phone_idx" ON "customers" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "order_code_idx" ON "orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "order_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "order_store_idx" ON "orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "service_code_idx" ON "services" USING btree ("code");--> statement-breakpoint
CREATE INDEX "service_name_idx" ON "services" USING btree ("name");--> statement-breakpoint
CREATE INDEX "order_services_order_idx" ON "orders_services" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_services_order_service_idx" ON "orders_services" USING btree ("order_id","service_id");--> statement-breakpoint
CREATE INDEX "order_services_service_idx" ON "orders_services" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_service_idx" ON "store_service_prices" USING btree ("store_id","service_id");--> statement-breakpoint
CREATE INDEX "order_products_order_idx" ON "orders_products" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_products_order_product_idx" ON "orders_products" USING btree ("order_id","product_id");--> statement-breakpoint
CREATE INDEX "order_products_product_idx" ON "orders_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "total_non_negative_check" CHECK ("orders"."total" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "discount_non_negative_check" CHECK ("orders"."discount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "discount_valid_check" CHECK (("orders"."total") >= "orders"."discount");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "code_len_check" CHECK (LENGTH(TRIM("stores"."code")) = 3);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "code_len_check" CHECK (LENGTH(TRIM("services"."code")) >= 1 AND LENGTH(TRIM("services"."code")) <= 4);--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "price_non_negative_check" CHECK ("orders_services"."price" >= 0);--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "qty_positive_check" CHECK ("orders_services"."qty" > 0);--> statement-breakpoint
ALTER TABLE "orders_services" ADD CONSTRAINT "discount_valid_check" CHECK (("orders_services"."price" * "orders_services"."qty") >= "orders_services"."discount");--> statement-breakpoint
ALTER TABLE "store_service_prices" ADD CONSTRAINT "price_non_negative_check" CHECK ("store_service_prices"."price" >= 0);--> statement-breakpoint
ALTER TABLE "orders_products" ADD CONSTRAINT "price_non_negative_check" CHECK ("orders_products"."price" >= 0);--> statement-breakpoint
ALTER TABLE "orders_products" ADD CONSTRAINT "qty_positive_check" CHECK ("orders_products"."qty" > 0);--> statement-breakpoint
ALTER TABLE "orders_products" ADD CONSTRAINT "discount_valid_check" CHECK (("orders_products"."price" * "orders_products"."qty") >= "orders_products"."discount");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "stock_non_negative_check" CHECK ("products"."stock" >= 0);