import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderServicesImagesTable, ordersTable } from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/errors";
import { softDeleteOrderServiceImageById } from "@/modules/order-service-images/order-service-image.repository";
import { getOrderServiceOrThrow } from "@/modules/orders/order.repository";
import type {
  PostOrderDropoffPhotoPresignInput,
  PostOrderServicePhotoInput,
  PostOrderServicePhotoPresignInput,
  PutOrderDropoffPhotoInput,
} from "@/modules/orders/order-admin.schema";
import type { JWTPayload } from "@/types";
import {
  buildMediaUrl,
  createPresignedUploadUrl,
  optimizeUploadedImage,
} from "@/utils/s3";

export async function createOrderServicePhotoPresign({
  orderId,
  serviceId,
  body,
}: {
  orderId: number;
  serviceId: number;
  body: PostOrderServicePhotoPresignInput;
}) {
  await getOrderServiceOrThrow(orderId, serviceId);

  const key = `orders/${orderId}/services/${serviceId}/${crypto.randomUUID()}`;
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

  const key = `orders/${orderId}/dropoff/${crypto.randomUUID()}`;
  return createPresignedUploadUrl({
    contentType: body.content_type,
    key,
  });
}

export async function saveOrderServicePhoto({
  orderId,
  serviceId,
  body,
  user,
}: {
  orderId: number;
  serviceId: number;
  body: PostOrderServicePhotoInput;
  user: JWTPayload;
}) {
  await getOrderServiceOrThrow(orderId, serviceId);

  if (!body.image_path.startsWith(`orders/${orderId}/services/${serviceId}/`)) {
    throw new BadRequestException("Invalid image path");
  }

  await optimizeUploadedImage(body.image_path);

  const [photo] = await db
    .insert(orderServicesImagesTable)
    .values({
      order_service_id: serviceId,
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

export async function deleteOrderServicePhoto({
  orderId,
  serviceId,
  photoId,
  user,
}: {
  orderId: number;
  serviceId: number;
  photoId: number;
  user: JWTPayload;
}) {
  await getOrderServiceOrThrow(orderId, serviceId);

  const photo = await db.query.orderServicesImagesTable.findFirst({
    where: {
      id: photoId,
      order_service_id: serviceId,
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

  const [deleted] = await softDeleteOrderServiceImageById(photoId, user.id);
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
  if (!body.image_path.startsWith(`orders/${orderId}/dropoff/`)) {
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
