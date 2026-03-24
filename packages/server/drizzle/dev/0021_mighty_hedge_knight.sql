ALTER TABLE "orders_services" ADD COLUMN "is_priority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "is_priority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "order_services_priority_idx" ON "orders_services" USING btree ("is_priority");--> statement-breakpoint
CREATE INDEX "service_priority_idx" ON "services" USING btree ("is_priority");