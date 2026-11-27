ALTER TABLE "orders" ADD COLUMN "request_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "order_request_id_idx" ON "orders" ("request_id");