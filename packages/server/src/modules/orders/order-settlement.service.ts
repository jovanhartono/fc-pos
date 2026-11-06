import type { DbExecutor } from "@/db";
import { BadRequestException } from "@/http-exceptions";
import {
  claimRedemptions,
  releaseRedemptions,
  voidCampaignsBelowMinimum,
} from "@/modules/campaigns/campaign-redemption.service";
import type { OrderTx } from "@/modules/orders/order.repository";
import {
  type ResolvedDiscount,
  resolveDiscount,
} from "@/modules/orders/order-discount.service";
import { findOrderState } from "@/modules/orders/order-read.repository";
import { recomputeOrderRollup } from "@/modules/orders/order-status-machine";
import { type DiscountSource, isBogoSlot } from "@/schema/discount";
import { hasUnpricedLine } from "@/schema/unpriced-line";

// Where a discount settles on an Order (ADR-0018). Drop-off, payment, Repair
// pricing and cancelling lines can all move the Customer's total, so the rules
// live here once.

export interface SettlementLine {
  complaint_id: number | null;
  price: string | null;
  service: { price: string | null } | null;
  service_id: number | null;
  status: string;
}

export interface DiscountRequest {
  campaign_ids: number[];
  discount: number;
  voucher_codes: string[];
}

export interface SettledDiscount {
  discountAmount: number;
  discountSource: DiscountSource;
}

// 0 already means a free Rework line (ADR-0013); "not priced yet" is blank.
export function assertLinePrice(price: number): void {
  if (price <= 0) {
    throw new BadRequestException("Price must be greater than zero");
  }
}

// No price, no payment (ADR-0018). Payment is all or nothing (ADR-0001), so one
// uninspected Repair holds up the whole Order.
export function assertPayable(lines: SettlementLine[]): void {
  if (hasUnpricedLine(lines)) {
    throw new BadRequestException(
      "Order has an unpriced line. Price it before collecting payment."
    );
  }
}

// No promo against a guessed Repair price (ADR-0018). Once settled, the discount
// is on the Customer's Receipt; a second one would spend the Voucher code twice.
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
      "Order has an unpriced line. Add discounts once every line is priced."
    );
  }
  if (isSettled) {
    throw new BadRequestException(
      "This Order's discount was settled at drop-off. Collect the printed total."
    );
  }
}

function bogoSlots(lines: SettlementLine[]) {
  return lines.flatMap((line) =>
    line.service_id !== null && isBogoSlot(line)
      ? [{ price: Number(line.price), service_id: line.service_id }]
      : []
  );
}

export interface SettleDiscountInput {
  grossTotal: number;
  lines: SettlementLine[];
  request: DiscountRequest;
  settled?: SettledDiscount;
  storeCode: string;
  storeId: number;
}

// What the discount would be, claiming nothing: a counter QRIS shows this
// amount and the Voucher code is spent only when the money arrives.
export function previewDiscount(
  executor: DbExecutor,
  {
    grossTotal,
    lines,
    request,
    settled,
    storeCode,
    storeId,
  }: SettleDiscountInput
): Promise<SettledDiscount & Pick<ResolvedDiscount, "campaignRows">> {
  if (settled) {
    return Promise.resolve({ ...settled, campaignRows: [] });
  }

  return resolveDiscount(executor, {
    campaignIds: request.campaign_ids,
    voucherCodes: request.voucher_codes,
    grossTotal,
    manualDiscount: request.discount,
    storeId,
    storeCode,
    lines: bogoSlots(lines),
  });
}

// The Voucher code and Usage limit slot are claimed as soon as the discount is on
// the Receipt, since the Customer holds the shop to it. Already settled → skip.
export async function settleDiscount(
  tx: OrderTx,
  { orderId, ...input }: SettleDiscountInput & { orderId: number }
): Promise<SettledDiscount> {
  if (input.settled) {
    return input.settled;
  }

  const { campaignRows, discountAmount, discountSource } =
    await previewDiscount(tx, input);

  await claimRedemptions(tx, campaignRows, orderId);

  return { discountAmount, discountSource };
}

// After a cancel or a lowered price on an unpaid Order. A fully cancelled Order
// gives its redemptions back (ADR-0015); one under its promo's minimum loses it,
// or "100k off, min 250k" would stay on a 160k Order.
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
