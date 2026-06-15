import { db } from "@/db";
import { orderPickupEventsTable } from "@/db/schema";
import { BadRequestException } from "@/errors";
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
} from "@/utils/s3";

// ADR-0005: the pickup code proves the customer in front of the cashier placed
// this Order. It is a per-Order check, never a cross-Order lookup.
function assertPickupCodeMatches(order: { pickup_code: string }, code: string) {
  if (code !== order.pickup_code) {
    throw new BadRequestException("Invalid pickup code");
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
    columns: { id: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const key = `orders/${orderId}/pickup/${crypto.randomUUID()}`;
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

  const uniqueServiceIds = Array.from(new Set(body.service_ids));
  if (uniqueServiceIds.length === 0) {
    throw new BadRequestException("At least one service must be picked up");
  }

  const [order, candidateServices] = await Promise.all([
    db.query.ordersTable.findFirst({
      where: { id: orderId },
      columns: { id: true, pickup_code: true },
    }),
    db.query.ordersServicesTable.findMany({
      where: {
        order_id: orderId,
        id: { in: uniqueServiceIds },
      },
      columns: {
        id: true,
        item_code: true,
        status: true,
      },
    }),
  ]);

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  assertPickupCodeMatches(order, body.pickup_code);

  if (candidateServices.length !== uniqueServiceIds.length) {
    throw new BadRequestException(
      "One or more services do not belong to this order"
    );
  }

  const notReady = candidateServices.filter(
    (service) => service.status !== "ready_for_pickup"
  );
  if (notReady.length > 0) {
    throw new BadRequestException(
      `Services not ready for pickup: ${notReady
        .map((service) => service.item_code ?? String(service.id))
        .join(", ")}`
    );
  }

  if (!body.image_path.startsWith(`orders/${orderId}/pickup/`)) {
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

    const { flippedIds } = await completePickup(tx, {
      orderId,
      serviceIds: uniqueServiceIds,
      pickupEventId: event.id,
      by: user.id,
      note: "Completed from order pickup desk",
    });

    if (flippedIds.length !== uniqueServiceIds.length) {
      throw new BadRequestException(
        "Another cashier already processed one of the selected items. Refresh and try again."
      );
    }

    return event;
  });

  return {
    id: pickupEvent.id,
    image_url: buildMediaUrl(body.image_path),
    order_id: orderId,
    picked_up_at: pickupEvent.picked_up_at,
    service_ids: uniqueServiceIds,
  };
}
