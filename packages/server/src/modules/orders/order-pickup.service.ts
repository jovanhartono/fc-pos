import { db } from "@/db";
import { orderPickupEventsTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import type {
  PostOrderPickupEventInput,
  PostOrderPickupEventPresignInput,
} from "@/modules/orders/order-admin.schema";
import { getOrderStateOrThrow } from "@/modules/orders/order-read.repository";
import { completePickup } from "@/modules/orders/order-status-machine";
import { assertCanProcessPickup } from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";
import {
  assertPhotoKeyUnder,
  buildMediaUrl,
  createPresignedUploadUrl,
  newPhotoKey,
  optimizeUploadedImage,
} from "@/utils/s3";

// ADR-0005: the Pickup code proves the Customer at the counter placed this Order.
// Checked per Order, never used to look one up.
function assertPickupCodeMatches(order: { pickup_code: string }, code: string) {
  if (code !== order.pickup_code) {
    throw new BadRequestException("Invalid pickup code");
  }
}

// ADR-0009: an Order is fully paid before any pickup, partial or not.
function assertOrderPaidForPickup(order: { payment_status: string }) {
  if (order.payment_status !== "paid") {
    throw new BadRequestException("Order must be paid before pickup");
  }
}

export async function createOrderPickupEventPresign({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderPickupEventPresignInput;
  user: JWTPayload;
}) {
  assertCanProcessPickup(user);

  const order = await getOrderStateOrThrow(db, orderId);

  assertOrderPaidForPickup(order);

  const key = newPhotoKey({ kind: "pickup", orderId });
  return createPresignedUploadUrl({
    contentType: body.content_type,
    key,
  });
}

export async function createOrderPickupEvent({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderPickupEventInput;
  user: JWTPayload;
}) {
  assertCanProcessPickup(user);

  const uniqueItemIds = Array.from(new Set(body.item_ids));
  if (uniqueItemIds.length === 0) {
    throw new BadRequestException("At least one item must be picked up");
  }

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true, pickup_code: true, payment_status: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  assertOrderPaidForPickup(order);

  assertPickupCodeMatches(order, body.pickup_code);

  assertPhotoKeyUnder(body.image_path, { kind: "pickup", orderId });

  await optimizeUploadedImage(body.image_path);

  // If another cashier hands back the same Items at the same moment, fewer lines
  // flip and this pickup event is rolled back.
  const pickupEvent = await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(orderPickupEventsTable)
      .values({
        order_id: orderId,
        image_path: body.image_path,
        picked_up_by: user.id,
      })
      .returning({
        id: orderPickupEventsTable.id,
        picked_up_at: orderPickupEventsTable.picked_up_at,
      });

    // completePickup decides which lines go and refuses a half-ready Item
    // (ADR-0017).
    const { handedOverIds, requestedIds } = await completePickup(tx, {
      orderId,
      itemIds: uniqueItemIds,
      pickupEventId: event.id,
      by: user.id,
      note: "Completed from order pickup desk",
    });

    if (handedOverIds.length !== requestedIds.length) {
      throw new BadRequestException(
        "Another cashier already processed one of the selected items. Refresh and try again."
      );
    }

    return { event, handedOverIds };
  });

  return {
    id: pickupEvent.event.id,
    image_url: buildMediaUrl(body.image_path),
    item_ids: uniqueItemIds,
    order_id: orderId,
    picked_up_at: pickupEvent.event.picked_up_at,
    service_ids: pickupEvent.handedOverIds,
  };
}
