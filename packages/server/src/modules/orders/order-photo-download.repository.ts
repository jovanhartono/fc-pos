import { db } from "@/db";
import type { PostPhotoDownloadUrlInput } from "@/modules/orders/order-admin.schema";

// What a saved photo is named after, where its file is, and which branch it belongs to. An
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
