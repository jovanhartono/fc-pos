import { eq } from "drizzle-orm";
import { db } from "@/db";
import { itemImagesTable, ordersTable } from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import { softDeleteItemImageById } from "@/modules/item-images/item-image.repository";
import { getItemOrThrow } from "@/modules/orders/order.repository";
import type {
  PostItemPhotoInput,
  PostItemPhotoPresignInput,
  PostOrderDropoffPhotoPresignInput,
  PutOrderDropoffPhotoInput,
} from "@/modules/orders/order-admin.schema";
import type { JWTPayload } from "@/types";
import {
  buildMediaUrl,
  createPresignedUploadUrl,
  optimizeUploadedImage,
  STORAGE_ENV_PREFIX,
} from "@/utils/s3";

// Item photos are keyed by the object, not the treatment (ADR-0019). Photos
// filed before that change keep their `services/{serviceId}/` keys — the sweep
// protects whatever path the database holds, so nothing is moved.
export async function createItemPhotoPresign({
  orderId,
  itemId,
  body,
}: {
  orderId: number;
  itemId: number;
  body: PostItemPhotoPresignInput;
}) {
  await getItemOrThrow(orderId, itemId);

  const key = `${STORAGE_ENV_PREFIX}orders/${orderId}/items/${itemId}/${crypto.randomUUID()}`;
  return createPresignedUploadUrl({
    contentType: body.content_type,
    key,
  });
}

export async function createOrderDropoffPhotoPresign({
  orderId,
  body,
}: {
  orderId: number;
  body: PostOrderDropoffPhotoPresignInput;
}) {
  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const key = `${STORAGE_ENV_PREFIX}orders/${orderId}/dropoff/${crypto.randomUUID()}`;
  return createPresignedUploadUrl({
    contentType: body.content_type,
    key,
  });
}

export async function saveItemPhoto({
  orderId,
  itemId,
  body,
  user,
}: {
  orderId: number;
  itemId: number;
  body: PostItemPhotoInput;
  user: JWTPayload;
}) {
  await getItemOrThrow(orderId, itemId);

  if (
    !body.image_path.startsWith(
      `${STORAGE_ENV_PREFIX}orders/${orderId}/items/${itemId}/`
    )
  ) {
    throw new BadRequestException("Invalid image path");
  }

  await optimizeUploadedImage(body.image_path);

  const [photo] = await db
    .insert(itemImagesTable)
    .values({
      item_id: itemId,
      image_path: body.image_path,
      note: body.note ?? null,
      uploaded_by: user.id,
    })
    .returning();

  return {
    ...photo,
    image_url: buildMediaUrl(photo.image_path),
  };
}

export async function deleteItemPhoto({
  orderId,
  itemId,
  photoId,
  user,
}: {
  orderId: number;
  itemId: number;
  photoId: number;
  user: JWTPayload;
}) {
  await getItemOrThrow(orderId, itemId);

  const photo = await db.query.itemImagesTable.findFirst({
    where: {
      id: photoId,
      item_id: itemId,
      deleted_at: { isNull: true },
    },
    columns: { id: true, uploaded_by: true },
  });

  if (!photo) {
    throw new BadRequestException("Photo not found");
  }

  if (user.role !== "admin" && photo.uploaded_by !== user.id) {
    throw new ForbiddenException(
      "Only the uploader or an admin can delete this photo"
    );
  }

  const [deleted] = await softDeleteItemImageById(photoId, user.id);
  if (!deleted) {
    throw new BadRequestException("Photo already deleted");
  }

  return { id: deleted.id };
}

export async function saveOrderDropoffPhoto({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PutOrderDropoffPhotoInput;
  user: JWTPayload;
}) {
  if (
    !body.image_path.startsWith(
      `${STORAGE_ENV_PREFIX}orders/${orderId}/dropoff/`
    )
  ) {
    throw new BadRequestException("Invalid image path");
  }

  await optimizeUploadedImage(body.image_path);

  const [order] = await db
    .update(ordersTable)
    .set({
      dropoff_photo_path: body.image_path,
      dropoff_photo_uploaded_at: new Date(),
      dropoff_photo_uploaded_by: user.id,
      updated_by: user.id,
    })
    .where(eq(ordersTable.id, orderId))
    .returning({
      id: ordersTable.id,
      dropoff_photo_uploaded_at: ordersTable.dropoff_photo_uploaded_at,
      dropoff_photo_path: ordersTable.dropoff_photo_path,
    });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  return {
    id: order.id,
    dropoff_photo_uploaded_at: order.dropoff_photo_uploaded_at,
    dropoff_photo_url: buildMediaUrl(order.dropoff_photo_path),
  };
}
