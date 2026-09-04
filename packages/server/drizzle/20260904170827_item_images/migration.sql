ALTER TABLE "order_services_images" RENAME TO "item_images";--> statement-breakpoint
ALTER TABLE "item_images" DROP CONSTRAINT "order_services_images_order_service_id_orders_services_id_fkey";--> statement-breakpoint
ALTER INDEX "order_services_images_deleted_at_idx" RENAME TO "item_images_deleted_at_idx";--> statement-breakpoint
DROP INDEX "order_services_images_service_idx";--> statement-breakpoint
ALTER TABLE "item_images" ADD COLUMN "item_id" integer;--> statement-breakpoint
-- ADR-0019: re-parent every photo from its treatment row onto the Item that
-- row belongs to. Written by hand: the generated delta added the column NOT
-- NULL with no value, which fails on any populated table.
UPDATE "item_images" AS i SET "item_id" = s."item_id" FROM "orders_services" AS s WHERE s."id" = i."order_service_id";--> statement-breakpoint
ALTER TABLE "item_images" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "item_images" DROP COLUMN "order_service_id";--> statement-breakpoint
CREATE INDEX "item_images_item_idx" ON "item_images" ("item_id");--> statement-breakpoint
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;
