import { isNotNull, isNull } from "drizzle-orm";
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
 * A soft-deleted Item photo is not filed. Its row stays as the record of who removed it and
 * when, but the picture itself is litter from the next sweep on — staff deleted it, and nothing
 * ever restores a deleted row (decided 2026-09-05).
 */
export async function listReferencedPhotoKeys(): Promise<Set<string>> {
  const [itemPhotos, dropoffPhotos, pickupPhotos] = await Promise.all([
    db
      .select({ path: itemImagesTable.image_path })
      .from(itemImagesTable)
      .where(isNull(itemImagesTable.deleted_at)),
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
