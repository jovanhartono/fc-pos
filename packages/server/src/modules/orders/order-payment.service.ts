import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { claimRedemptions } from "@/modules/campaigns/campaign-redemption.service";
import type { PatchOrderPaymentInput } from "@/modules/orders/order-admin.schema";
import { resolveDiscount } from "@/modules/orders/order-discount.service";
import { assertCanProcessPayment } from "@/modules/permissions/permissions";
import { isDiscountSettled } from "@/schema/discount";
import { hasUnpricedLine } from "@/schema/unpriced-line";
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
      discount_source: true,
      refunded_amount: true,
      payment_status: true,
      status: true,
      store_id: true,
    },
    with: {
      store: { columns: { code: true } },
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

  // ADR-0018: no price, no payment. A blank line is a Repair the workshop has
  // not inspected yet — the shop does not take money for a number nobody has
  // agreed on. Payment is binary (ADR-0001), so the whole Order waits, known
  // lines included. A cancelled line took the unpaid off-ramp (ADR-0008) and
  // no longer holds the rest of the Order's money.
  const serviceLines = await db.query.ordersServicesTable.findMany({
    where: { order_id: orderId },
    columns: {
      price: true,
      status: true,
      service_id: true,
    },
    with: {
      service: { columns: { price: true } },
    },
  });
  if (hasUnpricedLine(serviceLines)) {
    throw new BadRequestException(
      "Order has an unpriced line — set its price before collecting payment"
    );
  }

  // ADR-0018: the promo may already have settled at drop-off, when
  // every line was priced. Its voucher code is out of circulation and its
  // amount is printed on the Receipt the customer is holding. Resolving again
  // here would claim a second time and overwrite the number they were
  // promised, so the payment desk collects the printed total instead.
  const isSettledAtDropoff = isDiscountSettled(order.discount_source);
  if (
    isSettledAtDropoff &&
    (body.campaign_ids.length > 0 ||
      body.voucher_codes.length > 0 ||
      body.discount > 0)
  ) {
    throw new BadRequestException(
      "This order's discount was settled at drop-off — collect the printed total"
    );
  }

  const grossTotal = Number(order.total ?? 0);

  // BOGO stays exclusive (ADR-0018): a no-list-price line (Repair) is never
  // selectable as a buy-one-get-one free slot — a misconfigured Campaign must
  // not hand out a repair as a free item. Deliberate owner decision; it keys
  // on the catalog having no list price, not on the line's number.
  const lines = serviceLines.flatMap((line) =>
    line.status === "cancelled" ||
    line.service_id === null ||
    line.service?.price == null
      ? []
      : [{ price: Number(line.price), service_id: line.service_id }]
  );

  return await db.transaction(async (tx) => {
    // ADR-0018: for an Order whose promo settled at drop-off this
    // desk only books the tender — the stored amount stands, and re-claiming
    // it would spend the voucher twice. Otherwise the promo settles here,
    // which is the first moment every line has a price: the Campaign base is
    // the order total, and the claims commit or roll back with the payment.
    const { discountAmount, discountSource, campaignRows } = isSettledAtDropoff
      ? {
          discountAmount: Number(order.discount),
          discountSource: order.discount_source,
          campaignRows: [],
        }
      : await resolveDiscount({
          campaignIds: body.campaign_ids,
          voucherCodes: body.voucher_codes,
          grossTotal,
          manualDiscount: body.discount,
          storeId: order.store_id,
          storeCode: order.store.code,
          lines,
        });

    await claimRedemptions(tx, campaignRows, orderId);

    const netDue = grossTotal - discountAmount - Number(order.refunded_amount);

    // CAS on payment_status: two cashiers tapping collect at once must not
    // both book the money — the loser's transaction rolls back, and with it
    // any voucher its resolveDiscount claimed.
    const rows = await tx
      .update(ordersTable)
      .set({
        payment_method_id: body.payment_method_id,
        payment_status: "paid",
        discount: discountAmount.toString(),
        discount_source: discountSource,
        paid_amount: Math.max(netDue, 0).toString(),
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
