import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  itemImagesTable,
  itemsTable,
  orderPickupEventsTable,
  ordersTable,
} from "@/db/schema";

// What a saved photo is named after, and which branch it belongs to. Reads the same three
// places listReferencedPhotoKeys does: an Item shot is named by the tag on the object, the
// handover and pickup shots by the Order.
export interface StoredPhoto {
  code: string;
  store_id: number;
  suffix: string;
}

export async function findPhotoByPath(
  path: string
): Promise<StoredPhoto | null> {
  const [itemPhoto, dropoffOrder, pickupEvent] = await Promise.all([
    db
      .select({
        code: itemsTable.item_code,
        photo_id: itemImagesTable.id,
        store_id: ordersTable.store_id,
      })
      .from(itemImagesTable)
      .innerJoin(itemsTable, eq(itemsTable.id, itemImagesTable.item_id))
      .innerJoin(ordersTable, eq(ordersTable.id, itemsTable.order_id))
      .where(eq(itemImagesTable.image_path, path))
      .limit(1),
    db
      .select({ code: ordersTable.code, store_id: ordersTable.store_id })
      .from(ordersTable)
      .where(eq(ordersTable.dropoff_photo_path, path))
      .limit(1),
    db
      .select({
        code: ordersTable.code,
        event_id: orderPickupEventsTable.id,
        store_id: ordersTable.store_id,
      })
      .from(orderPickupEventsTable)
      .innerJoin(
        ordersTable,
        eq(ordersTable.id, orderPickupEventsTable.order_id)
      )
      .where(eq(orderPickupEventsTable.image_path, path))
      .limit(1),
  ]);

  if (itemPhoto[0]) {
    const { code, photo_id, store_id } = itemPhoto[0];
    return { code, store_id, suffix: `photo-${photo_id}` };
  }
  if (dropoffOrder[0]) {
    return { ...dropoffOrder[0], suffix: "dropoff" };
  }
  if (pickupEvent[0]) {
    const { code, event_id, store_id } = pickupEvent[0];
    return { code, store_id, suffix: `pickup-${event_id}` };
  }
  return null;
}
