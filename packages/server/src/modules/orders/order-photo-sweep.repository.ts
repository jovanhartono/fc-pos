import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  orderPickupEventsTable,
  orderServicesImagesTable,
  ordersTable,
} from "@/db/schema";

/**
 * Every photo an order still points at, across the three places one can be filed: against a
 * service line, as the drop-off shot, and as proof of pickup.
 *
 * Soft-deleted service photos count as filed. The row is recoverable, so its photo has to be
 * there when someone recovers it.
 */
export async function listReferencedPhotoKeys(): Promise<Set<string>> {
  const [servicePhotos, dropoffPhotos, pickupPhotos] = await Promise.all([
    db
      .select({ path: orderServicesImagesTable.image_path })
      .from(orderServicesImagesTable),
    db
      .select({ path: ordersTable.dropoff_photo_path })
      .from(ordersTable)
      .where(isNotNull(ordersTable.dropoff_photo_path)),
    db
      .select({ path: orderPickupEventsTable.image_path })
      .from(orderPickupEventsTable),
  ]);

  const referenced = new Set<string>();
  for (const { path } of [
    ...servicePhotos,
    ...dropoffPhotos,
    ...pickupPhotos,
  ]) {
    if (path) {
      referenced.add(path);
    }
  }

  return referenced;
}
