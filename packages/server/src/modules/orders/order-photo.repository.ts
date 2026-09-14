import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  itemImagesTable,
  orderPickupEventsTable,
  ordersTable,
} from "@/db/schema";
import type { PostPhotoDownloadUrlInput } from "@/modules/orders/order-admin.schema";

export function softDeleteItemImageById(id: number, userId: number) {
  return db
    .update(itemImagesTable)
    .set({ deleted_at: new Date(), deleted_by: userId })
    .where(and(eq(itemImagesTable.id, id), isNull(itemImagesTable.deleted_at)))
    .returning({ id: itemImagesTable.id });
}

// What a saved photo is named after, where its file is, and which Store it belongs to. An
// Item shot is named by the tag on the object, the handover and pickup shots by the Order.
export interface StoredPhoto {
  code: string;
  image_path: string;
  store_id: number;
  suffix: string;
}

export async function findPhotoById({
  kind,
  id,
}: PostPhotoDownloadUrlInput): Promise<StoredPhoto | null> {
  switch (kind) {
    case "item": {
      const photo = await db.query.itemImagesTable.findFirst({
        where: { id, deleted_at: { isNull: true } },
        columns: { id: true, image_path: true },
        with: {
          item: {
            columns: { item_code: true },
            with: { order: { columns: { store_id: true } } },
          },
        },
      });
      return photo
        ? {
            code: photo.item.item_code,
            image_path: photo.image_path,
            store_id: photo.item.order.store_id,
            suffix: `photo-${photo.id}`,
          }
        : null;
    }
    case "dropoff": {
      const order = await db.query.ordersTable.findFirst({
        where: { id, dropoff_photo_path: { isNotNull: true } },
        columns: { code: true, dropoff_photo_path: true, store_id: true },
      });
      return order?.dropoff_photo_path
        ? {
            code: order.code,
            image_path: order.dropoff_photo_path,
            store_id: order.store_id,
            suffix: "dropoff",
          }
        : null;
    }
    case "pickup": {
      const event = await db.query.orderPickupEventsTable.findFirst({
        where: { id },
        columns: { id: true, image_path: true },
        with: { order: { columns: { code: true, store_id: true } } },
      });
      return event
        ? {
            code: event.order.code,
            image_path: event.image_path,
            store_id: event.order.store_id,
            suffix: `pickup-${event.id}`,
          }
        : null;
    }
    default:
      return kind satisfies never;
  }
}

/**
 * Every photo an order still points at, across the three places one can be filed: against an
 * Item, as the drop-off shot, and as proof of pickup.
 *
 * Soft-deleted Item photos count as filed. The row is recoverable, so its photo has to be
 * there when someone recovers it — and until then it is still evidence a dispute can be argued
 * from. (Briefly reversed in #104, put back the same day: owner's call.)
 */
export async function listReferencedPhotoKeys(): Promise<Set<string>> {
  const [itemPhotos, dropoffPhotos, pickupPhotos] = await Promise.all([
    db.select({ path: itemImagesTable.image_path }).from(itemImagesTable),
    db
      .select({ path: ordersTable.dropoff_photo_path })
      .from(ordersTable)
      .where(isNotNull(ordersTable.dropoff_photo_path)),
    db
      .select({ path: orderPickupEventsTable.image_path })
      .from(orderPickupEventsTable),
  ]);

  const referenced = new Set<string>();
  for (const { path } of [...itemPhotos, ...dropoffPhotos, ...pickupPhotos]) {
    if (path) {
      referenced.add(path);
    }
  }

  return referenced;
}
