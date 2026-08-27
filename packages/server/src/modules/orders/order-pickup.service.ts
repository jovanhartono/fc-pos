import { db } from "@/db";
import { orderPickupEventsTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import type {
  PostOrderPickupEventInput,
  PostOrderPickupEventPresignInput,
} from "@/modules/orders/order-admin.schema";
import { completePickup } from "@/modules/orders/order-status-machine";
import { assertCanProcessPickup } from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";
import {
  buildMediaUrl,
  createPresignedUploadUrl,
  optimizeUploadedImage,
  STORAGE_ENV_PREFIX,
} from "@/utils/s3";

// ADR-0005: the pickup code proves the customer in front of the cashier placed
// this Order. It is a per-Order check, never a cross-Order lookup.
function assertPickupCodeMatches(order: { pickup_code: string }, code: string) {
  if (code !== order.pickup_code) {
    throw new BadRequestException("Invalid pickup code");
  }
}

// ADR-0009: payment precedes pickup. An Order must be fully paid before any
// pickup event — partial or not. Enforced here so the rule holds regardless of
// the caller.
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

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true, payment_status: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  assertOrderPaidForPickup(order);

  const key = `${STORAGE_ENV_PREFIX}orders/${orderId}/pickup/${crypto.randomUUID()}`;
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

  if (
    !body.image_path.startsWith(
      `${STORAGE_ENV_PREFIX}orders/${orderId}/pickup/`
    )
  ) {
    throw new BadRequestException("Invalid image path");
  }

  await optimizeUploadedImage(body.image_path);

  // One transaction: insert the pickup event + flip the services together. A
  // concurrent pickup of the same items leaves fewer rows ready, so completePickup
  // returns a short flip — we throw and the transaction rolls the insert back.
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

    // Which treatment rows flip is the machine's call — it resolves the
    // objects' live siblings in this same transaction and refuses a half-ready
    // one (ADR-0017).
    const { flippedIds, requestedIds } = await completePickup(tx, {
      orderId,
      itemIds: uniqueItemIds,
      pickupEventId: event.id,
      by: user.id,
      note: "Completed from order pickup desk",
    });

    if (flippedIds.length !== requestedIds.length) {
      throw new BadRequestException(
        "Another cashier already processed one of the selected items. Refresh and try again."
      );
    }

    return { event, flippedIds };
  });

  return {
    id: pickupEvent.event.id,
    image_url: buildMediaUrl(body.image_path),
    item_ids: uniqueItemIds,
    order_id: orderId,
    picked_up_at: pickupEvent.event.picked_up_at,
    service_ids: pickupEvent.flippedIds,
  };
}
