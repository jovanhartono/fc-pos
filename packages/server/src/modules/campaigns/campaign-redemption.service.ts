import { eq } from "drizzle-orm";
import { orderCampaignsTable, ordersTable } from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import {
  atomicClaimCampaignCode,
  atomicIncrementCampaignRedeemed,
  decrementCampaignRedeemed,
  deleteOrderCampaignsByOrderId,
  findOrderCampaignMinimums,
  findOrderCampaignsByOrderId,
  releaseCampaignCodeRedemption,
} from "@/modules/campaigns/campaign.repository";
import type { OrderTx } from "@/modules/orders/order.repository";

// ADR-0015: a Campaign is claimed at checkout and given back only when a
// Cancellation closes the whole Order, never on a Refund or a partial cancel.

export interface CampaignRedemptionFields {
  applied_amount: string;
  buy_quantity: number | null;
  campaign_id: number;
  discount_type: "fixed" | "percentage" | "buy_n_get_m_free";
  discount_value: string;
  free_quantity: number | null;
  max_discount: string | null;
}

// A union so a Voucher row cannot lose its code: without it the Order would
// take the discount while the Voucher code stayed spendable (ADR-0015).
export type ResolvedCampaignRow = CampaignRedemptionFields &
  ({ kind: "listed" } | { kind: "voucher"; voucherCode: string });

export async function claimRedemptions(
  tx: OrderTx,
  campaignRows: ResolvedCampaignRow[],
  orderId: number
) {
  if (campaignRows.length === 0) {
    return;
  }

  const resolvedCodeIds = new Map<number, number>(); // campaignId -> codeId

  for (const row of campaignRows) {
    if (row.kind === "listed") {
      const claimed = await atomicIncrementCampaignRedeemed(
        tx,
        row.campaign_id
      );
      if (!claimed) {
        throw new BadRequestException(
          `Campaign ${row.campaign_id} has reached its usage limit`
        );
      }
    } else {
      const claimed = await atomicClaimCampaignCode(
        tx,
        row.voucherCode,
        orderId
      );
      if (!claimed) {
        throw new BadRequestException(
          `Voucher code ${row.voucherCode} has already been redeemed`
        );
      }
      resolvedCodeIds.set(row.campaign_id, claimed.codeId);
    }
  }

  await tx.insert(orderCampaignsTable).values(
    campaignRows.map((row) => ({
      order_id: orderId,
      campaign_id: row.campaign_id,
      code_id: resolvedCodeIds.get(row.campaign_id) ?? null,
      discount_type: row.discount_type,
      discount_value: row.discount_value,
      max_discount: row.max_discount,
      applied_amount: row.applied_amount,
      buy_quantity: row.buy_quantity,
      free_quantity: row.free_quantity,
    }))
  );
}

// Only called when a Cancellation closes the whole Order.
export async function releaseRedemptions(tx: OrderTx, orderId: number) {
  const orderCampaigns = await findOrderCampaignsByOrderId(tx, orderId);
  for (const oc of orderCampaigns) {
    if (oc.code_id === null) {
      await decrementCampaignRedeemed(tx, oc.campaign_id);
    } else {
      await releaseCampaignCodeRedemption(tx, oc.code_id);
    }
  }
}

// Call from every path that lowers an unpaid Order's total after Settling
// (ADR-0018, ADR-0008): "100k off, min 250k" on a shrunken Order is free money.
export async function voidCampaignsBelowMinimum(
  tx: OrderTx,
  orderId: number,
  billableTotal: number
) {
  const attached = await findOrderCampaignMinimums(tx, orderId);
  if (attached.length === 0) {
    return;
  }
  if (
    attached.every((row) => billableTotal >= Number(row.minOrderTotal ?? 0))
  ) {
    return;
  }

  // Every Campaign goes, not only the one that broke: the cashier re-applies in
  // one tap with every rule re-checked, safer than recomputing a stacked discount.
  await releaseRedemptions(tx, orderId);
  await deleteOrderCampaignsByOrderId(tx, orderId);
  await tx
    .update(ordersTable)
    .set({ discount: "0", discount_source: "none" })
    .where(eq(ordersTable.id, orderId));
}
