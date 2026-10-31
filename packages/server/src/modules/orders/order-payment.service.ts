import { and, eq } from "drizzle-orm";
import { type DbExecutor, db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import {
  findSettlementLines,
  type OrderTx,
} from "@/modules/orders/order.repository";
import type { PatchOrderPaymentInput } from "@/modules/orders/order-admin.schema";
import { findOrderState } from "@/modules/orders/order-read.repository";
import {
  assertDiscountRequestAllowed,
  assertPayable,
  type DiscountRequest,
  previewDiscount,
  type SettleDiscountInput,
  settleDiscount,
} from "@/modules/orders/order-settlement.service";
import { assertCanProcessPayment } from "@/modules/permissions/permissions";
import { isDiscountSettled, orderNetDue } from "@/schema/discount";
import type { JWTPayload } from "@/types";

// A QRIS was shown for one amount and the Order now owes another (a price or
// promo changed meanwhile), so the money cannot simply be booked against it.
export class NetDueChangedError extends Error {
  constructor(expected: number, actual: number) {
    super(`Charged ${expected} but the Order now owes ${actual}`);
    this.name = "NetDueChangedError";
  }
}

async function findPayableOrder(
  executor: DbExecutor,
  orderId: number,
  request: DiscountRequest
) {
  const order = await findOrderState(executor, orderId);

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

  const lines = await findSettlementLines(executor, orderId);
  assertPayable(lines);

  const isSettledAtDropoff = isDiscountSettled(order.discount_source);
  assertDiscountRequestAllowed({
    hasBlankLine: false,
    isSettled: isSettledAtDropoff,
    request,
  });

  // A promo settled at drop-off keeps the amount on the Receipt; otherwise it
  // settles at payment and its claims stand or fall with the payment.
  const discountInput: SettleDiscountInput = {
    grossTotal: Number(order.total ?? 0),
    lines,
    request,
    settled: isSettledAtDropoff
      ? {
          discountAmount: Number(order.discount),
          discountSource: order.discount_source,
        }
      : undefined,
    storeCode: order.store.code,
    storeId: order.store_id,
  };

  return { discountInput, order };
}

// What a counter QRIS asks for, without spending the Voucher code: the
// Customer may still walk away from the QR.
export async function quoteOrderNetDue(
  orderId: number,
  request: DiscountRequest
) {
  const payable = await findPayableOrder(db, orderId, request);

  if (!payable) {
    return null;
  }

  const { discountAmount } = await previewDiscount(db, payable.discountInput);

  return orderNetDue({
    grossTotal: payable.discountInput.grossTotal,
    discount: discountAmount,
    refunded: Number(payable.order.refunded_amount),
  });
}

interface MarkOrderPaidInput {
  // null when the Customer paid online from the Track page.
  actorId: number | null;
  expectedNetDue?: number;
  orderId: number;
  paymentMethodId: number;
  request: DiscountRequest;
  tx?: OrderTx;
}

// Shared by the cashier's Mark as paid and a gateway confirming the money.
export function markOrderPaid({ tx, ...input }: MarkOrderPaidInput) {
  // Read inside the transaction, so a price set mid-payment cannot leave the
  // Customer paying a total that no longer matches their lines.
  return tx
    ? markOrderPaidIn(tx, input)
    : db.transaction((newTx) => markOrderPaidIn(newTx, input));
}

async function markOrderPaidIn(
  tx: OrderTx,
  {
    actorId,
    expectedNetDue,
    orderId,
    paymentMethodId,
    request,
  }: Omit<MarkOrderPaidInput, "tx">
) {
  const payable = await findPayableOrder(tx, orderId, request);

  if (!payable) {
    return null;
  }

  const { discountAmount, discountSource } = await settleDiscount(tx, {
    ...payable.discountInput,
    orderId,
  });

  const netDue = orderNetDue({
    grossTotal: payable.discountInput.grossTotal,
    discount: discountAmount,
    refunded: Number(payable.order.refunded_amount),
  });

  if (expectedNetDue !== undefined && netDue !== expectedNetDue) {
    throw new NetDueChangedError(expectedNetDue, netDue);
  }

  // Two cashiers tapping collect at once must not both book the money; the
  // loser rolls back, Voucher claim included.
  const rows = await tx
    .update(ordersTable)
    .set({
      payment_method_id: paymentMethodId,
      payment_status: "paid",
      discount: discountAmount.toString(),
      discount_source: discountSource,
      paid_amount: netDue.toString(),
      paid_at: new Date(),
      paid_by: actorId,
      ...(actorId === null ? {} : { updated_by: actorId }),
    })
    .where(
      and(eq(ordersTable.id, orderId), eq(ordersTable.payment_status, "unpaid"))
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
}

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

  return await markOrderPaid({
    actorId: user.id,
    orderId,
    paymentMethodId: body.payment_method_id,
    request: body,
  });
}
