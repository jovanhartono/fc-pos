import { db } from "@/db";
import { orderPickupNoticesTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { getOrderStateOrThrow } from "@/modules/orders/order-read.repository";
import { assertCanSendPickupNotice } from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";

export async function createOrderPickupNotice({
  orderId,
  user,
}: {
  orderId: number;
  user: JWTPayload;
}) {
  assertCanSendPickupNotice(user);

  const order = await getOrderStateOrThrow(db, orderId);

  if (order.status !== "ready_for_pickup") {
    throw new BadRequestException(
      "A pickup notice can only be sent once the order is ready for pickup"
    );
  }

  await db
    .insert(orderPickupNoticesTable)
    .values({ order_id: orderId, sent_by: user.id });
}
