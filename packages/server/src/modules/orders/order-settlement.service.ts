import { BadRequestException } from "@/http-exceptions";
import {
  claimRedemptions,
  releaseRedemptions,
  voidCampaignsBelowMinimum,
} from "@/modules/campaigns/campaign-redemption.service";
import type { OrderTx } from "@/modules/orders/order.repository";
import { resolveDiscount } from "@/modules/orders/order-discount.service";
import { findOrderState } from "@/modules/orders/order-read.repository";
import { recomputeOrderRollup } from "@/modules/orders/order-status-machine";
import type { DiscountSource } from "@/schema/discount";
import { hasUnpricedLine } from "@/schema/unpriced-line";

// Where a discount settles on an Order (ADR-0018). Four desks reach this —
// the counter at drop-off, the pickup desk at payment, the workshop keying a
// Repair's price, and the desk voiding lines — and each of them can move the
// number the customer was promised, so the gates and the claim live here once
// rather than four times.

export interface SettlementLine {
  price: string | null;
  service: { price: string | null } | null;
  service_id: number | null;
  status: string;
}

// What a cashier is asking for, exactly as the POS sends it.
export interface DiscountRequest {
  campaign_ids: number[];
  discount: number;
  voucher_codes: string[];
}

export interface SettledDiscount {
  discountAmount: number;
  discountSource: DiscountSource;
}

// Zero is not a price: 0 already means deliberately free — a Rework line
// (ADR-0013) — and "not priced yet" is a blank, not a keyed zero.
export function assertLinePrice(price: number): void {
  if (price <= 0) {
    throw new BadRequestException("Price must be greater than zero");
  }
}

// No price, no payment (ADR-0018). A blank line is a Repair the workshop has
// not inspected yet, and payment is binary (ADR-0001), so the whole Order
// waits — the lines the counter already knows included.
export function assertPayable(lines: SettlementLine[]): void {
  if (hasUnpricedLine(lines)) {
    throw new BadRequestException(
      "Order has an unpriced line — set its price before collecting payment"
    );
  }
}

// A promo settled against a guessed Repair price is the failure ADR-0018 makes
// impossible, so a blank line turns one away outright. And once a discount has
// settled, its amount is printed on the Receipt the customer is holding and its
// voucher code is out of circulation — keying a second one would spend the code
// twice and hand back a different number than the paper says.
export function assertDiscountRequestAllowed({
  hasBlankLine,
  isSettled,
  request,
}: {
  hasBlankLine: boolean;
  isSettled: boolean;
  request: DiscountRequest;
}): void {
  const asksForOne =
    request.campaign_ids.length > 0 ||
    request.voucher_codes.length > 0 ||
    request.discount > 0;

  if (!asksForOne) {
    return;
  }
  if (hasBlankLine) {
    throw new BadRequestException(
      "Order has an unpriced line — promotions wait until every item is priced"
    );
  }
  if (isSettled) {
    throw new BadRequestException(
      "This order's discount was settled at drop-off — collect the printed total"
    );
  }
}

// BOGO stays exclusive (ADR-0018): a no-list-price line (Repair) is never
// selectable as a buy-one-get-one free slot — a misconfigured Campaign must not
// hand out a repair as a free item. It keys on the catalog having no list
// price, not on the line's own number.
function bogoSlots(lines: SettlementLine[]) {
  return lines.flatMap((line) =>
    line.status === "cancelled" ||
    line.service_id === null ||
    line.service?.price == null
      ? []
      : [{ price: Number(line.price), service_id: line.service_id }]
  );
}

// Attaching is claiming: the voucher code leaves circulation and the usage slot
// is taken the moment the discount goes on the Receipt, because that Receipt is
// what the customer will hold the shop to. An Order whose promo already settled
// skips the desk entirely — resolving again would spend the code a second time.
export async function settleDiscount(
  tx: OrderTx,
  {
    grossTotal,
    lines,
    orderId,
    request,
    settled,
    storeCode,
    storeId,
  }: {
    grossTotal: number;
    lines: SettlementLine[];
    orderId: number;
    request: DiscountRequest;
    settled?: SettledDiscount;
    storeCode: string;
    storeId: number;
  }
): Promise<SettledDiscount> {
  if (settled) {
    return settled;
  }

  const { campaignRows, discountAmount, discountSource } =
    await resolveDiscount(tx, {
      campaignIds: request.campaign_ids,
      voucherCodes: request.voucher_codes,
      grossTotal,
      manualDiscount: request.discount,
      storeId,
      storeCode,
      lines: bogoSlots(lines),
    });

  await claimRedemptions(tx, campaignRows, orderId);

  return { discountAmount, discountSource };
}

// Every path that lowers an unpaid Order's bill ends here: a line cancelled, a
// price corrected down. A fully cancelled Order never economically happened, so
// its redemptions go back in the pool (ADR-0015); one that survives but no
// longer clears the minimum its promo was granted against loses the promo, or a
// "100k off, min 250k" rides an Order shrunk to 160k and hands back most of
// what is left to pay.
export async function revalidateSettledPromo(
  tx: OrderTx,
  orderId: number,
  by: number
): Promise<void> {
  await recomputeOrderRollup(tx, orderId, by);

  const order = await findOrderState(tx, orderId);

  if (order?.status === "cancelled") {
    await releaseRedemptions(tx, orderId);
    return;
  }

  // Money that already moved was earned against the printed total.
  if (order?.payment_status === "unpaid") {
    await voidCampaignsBelowMinimum(tx, orderId, Number(order.total ?? 0));
  }
}
