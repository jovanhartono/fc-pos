CREATE TABLE "order_pickup_notices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_pickup_notices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"sent_by" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "order_pickup_notices_order_idx" ON "order_pickup_notices" ("order_id");--> statement-breakpoint
ALTER TABLE "order_pickup_notices" ADD CONSTRAINT "order_pickup_notices_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_pickup_notices" ADD CONSTRAINT "order_pickup_notices_sent_by_users_id_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id");