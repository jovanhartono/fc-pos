ALTER TABLE "order_counters" ALTER COLUMN "date_str" SET DATA TYPE varchar(8);--> statement-breakpoint
ALTER TABLE "order_counters" ALTER COLUMN "last_number" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "code" SET DATA TYPE varchar(32);--> statement-breakpoint
CREATE UNIQUE INDEX "order_counter_store_date_uidx" ON "order_counters" USING btree ("store_code","date_str");--> statement-breakpoint
CREATE INDEX "order_store_created_at_idx" ON "orders" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_created_at_idx" ON "orders" USING btree ("created_at");