import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { findSettlementLines } from "@/modules/orders/order.repository";
import type { PatchOrderPaymentInput } from "@/modules/orders/order-admin.schema";
import { findOrderState } from "@/modules/orders/order-read.repository";
import {
  assertDiscountRequestAllowed,
  assertPayable,
  settleDiscount,
} from "@/modules/orders/order-settlement.service";
import { assertCanProcessPayment } from "@/modules/permissions/permissions";
import { isDiscountSettled, orderNetDue } from "@/schema/discount";
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

  // Read inside the transaction, so a price set mid-payment cannot leave the
  // Customer paying a total that no longer matches their lines.
  return await db.transaction(async (tx) => {
    const order = await findOrderState(tx, orderId);

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

    const lines = await findSettlementLines(tx, orderId);
    assertPayable(lines);

    const isSettledAtDropoff = isDiscountSettled(order.discount_source);
    assertDiscountRequestAllowed({
      hasBlankLine: false,
      isSettled: isSettledAtDropoff,
      request: body,
    });

    const grossTotal = Number(order.total ?? 0);

    // A promo settled at drop-off keeps the amount on the Receipt; otherwise it
    // settles here and its claims stand or fall with the payment.
    const { discountAmount, discountSource } = await settleDiscount(tx, {
      grossTotal,
      lines,
      orderId,
      request: body,
      settled: isSettledAtDropoff
        ? {
            discountAmount: Number(order.discount),
            discountSource: order.discount_source,
          }
        : undefined,
      storeCode: order.store.code,
      storeId: order.store_id,
    });

    const netDue = orderNetDue({
      grossTotal,
      discount: discountAmount,
      refunded: Number(order.refunded_amount),
    });

    // Two cashiers tapping collect at once must not both book the money; the
    // loser rolls back, Voucher claim included.
    const rows = await tx
      .update(ordersTable)
      .set({
        payment_method_id: body.payment_method_id,
        payment_status: "paid",
        discount: discountAmount.toString(),
        discount_source: discountSource,
        paid_amount: netDue.toString(),
        paid_at: new Date(),
        paid_by: user.id,
        updated_by: user.id,
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.payment_status, "unpaid")
        )
      )
      .returning({
        id: ordersTable.id,
        payment_status: ordersTable.payment_status,
        paid_amount: ordersTable.paid_amount,
      });

    if (!rows[0]) {
      throw new BadRequestException("Order has already been paid");
    }

    return rows[0];
  });
}
