import { eq } from "drizzle-orm";
import { db } from "@/db";
import { itemImagesTable, ordersTable } from "@/db/schema";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@/http-exceptions";
import { getItemOrThrow } from "@/modules/orders/order.repository";
import type {
  PostItemPhotoInput,
  PostItemPhotoPresignInput,
  PostOrderDropoffPhotoPresignInput,
  PostPhotoDownloadUrlInput,
  PutOrderDropoffPhotoInput,
} from "@/modules/orders/order-admin.schema";
import {
  findPhotoById,
  softDeleteItemImageById,
} from "@/modules/orders/order-photo.repository";
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";
import {
  assertPhotoKeyUnder,
  buildMediaUrl,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  isStoredObjectReadable,
  newPhotoKey,
  optimizeUploadedImage,
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

  const key = newPhotoKey({ itemId, kind: "item", orderId });
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

  const key = newPhotoKey({ kind: "dropoff", orderId });
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

  assertPhotoKeyUnder(body.image_path, { itemId, kind: "item", orderId });

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
  assertPhotoKeyUnder(body.image_path, { kind: "dropoff", orderId });

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

// Order codes read `#JKT/20260907/12`, and item codes carry that plus `-I001`. Neither survives
// as a filename — `/` is a folder, `#` a fragment — so both are flattened to the characters
// every OS and the Content-Disposition header agree on.
const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9._-]+/g;

function toFilenameSlug(code: string) {
  return code.replace(UNSAFE_FILENAME_CHARS, "-").replace(/^-+|-+$/g, "");
}

const KEY_EXTENSION = /\.([A-Za-z0-9]{1,5})$/;

// Uploads are stored under extension-less keys and are always WebP (optimizeUploadedImage);
// seed photos keep the `.jpg` they were filed with, so a key that says what it is wins.
function extensionOf(key: string) {
  return KEY_EXTENSION.exec(key)?.[1].toLowerCase() ?? "webp";
}

// A link that saves the photo as a file, for the operator putting a dispute pack together.
// Same rule as opening the order: the person has to work at that branch.
export async function createPhotoDownloadUrl({
  body,
  user,
}: {
  body: PostPhotoDownloadUrlInput;
  user: JWTPayload;
}) {
  const photo = await findPhotoById(body);
  if (!photo) {
    throw new NotFoundException("Photo not found");
  }
  await assertStoreAccess(user, photo.store_id);

  const key = photo.image_path;
  if (!(await isStoredObjectReadable(key))) {
    throw new NotFoundException("The photo file is no longer in storage");
  }

  const filename = `${toFilenameSlug(photo.code)}-${photo.suffix}.${extensionOf(key)}`;
  return { url: createPresignedDownloadUrl({ key, filename }) };
}
