import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { assertCanCreateOrder } from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";

// ADR-0029: settled with the Customer after drop-off, e.g. once a GoSend quote
// comes in. Payment is all-or-nothing, so a paid Order's fee is frozen.
export async function updateOrderDeliveryFee({
  orderId,
  deliveryFee,
  user,
}: {
  orderId: number;
  deliveryFee: number;
  user: JWTPayload;
}) {
  assertCanCreateOrder(user);

  const rows = await db
    .update(ordersTable)
    .set({ delivery_fee: deliveryFee.toString(), updated_by: user.id })
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.payment_status, "unpaid"),
        ne(ordersTable.status, "cancelled")
      )
    )
    .returning({
      id: ordersTable.id,
      delivery_fee: ordersTable.delivery_fee,
    });

  if (rows[0]) {
    return rows[0];
  }

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { payment_status: true },
  });

  if (!order) {
    return null;
  }

  throw new BadRequestException(
    order.payment_status === "paid"
      ? "Order has been paid — its Delivery fee is frozen"
      : "Cannot set a Delivery fee on a cancelled order"
  );
}
