import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  itemImagesTable,
  orderPickupEventsTable,
  ordersTable,
} from "@/db/schema";

/**
 * Every photo an order still points at, across the three places one can be filed: against an
 * Item, as the drop-off shot, and as proof of pickup.
 *
 * Soft-deleted Item photos count as filed. The row is recoverable, so its photo has to be
 * there when someone recovers it.
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
