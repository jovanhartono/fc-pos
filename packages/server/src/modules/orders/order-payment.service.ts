import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException } from "@/errors";
import type { PatchOrderPaymentInput } from "@/modules/orders/order-admin.schema";
import { assertCanProcessPayment } from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";

export async function updateOrderPayment({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PatchOrderPaymentInput;
  user: JWTPayload;
}) {
  assertCanProcessPayment(user);

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: {
      id: true,
      total: true,
      discount: true,
      refunded_amount: true,
      payment_status: true,
      status: true,
    },
  });

  if (!order) {
    return null;
  }

  if (order.payment_status === "paid") {
    throw new BadRequestException("Order has already been paid");
  }

  if (order.status === "cancelled") {
    throw new BadRequestException(
      "Cannot collect payment on a cancelled order"
    );
  }

  const netDue =
    Number(order.total ?? 0) -
    Number(order.discount) -
    Number(order.refunded_amount);

  const rows = await db
    .update(ordersTable)
    .set({
      payment_method_id: body.payment_method_id,
      payment_status: "paid",
      paid_amount: Math.max(netDue, 0).toString(),
      paid_at: new Date(),
      updated_by: user.id,
    })
    .where(eq(ordersTable.id, orderId))
    .returning({
      id: ordersTable.id,
      payment_status: ordersTable.payment_status,
      paid_amount: ordersTable.paid_amount,
    });

  return rows[0] ?? null;
}
