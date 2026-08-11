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

// The campaign-redemption seam (ADR-0015): redemptions are claimed atomically
// inside the order transaction at checkout, and released only when a cancel
// fully closes the Order — never on refund (money moved, the discount stays
// spent) and never on a partial cancel (the Order survives, its discount stays
// applied). The exactly-once release gate lives at the cancel call site; both
// sides of the bookkeeping live here.

export interface CampaignRedemptionFields {
  applied_amount: string;
  buy_quantity: number | null;
  campaign_id: number;
  discount_type: "fixed" | "percentage" | "buy_n_get_m_free";
  discount_value: string;
  free_quantity: number | null;
  max_discount: string | null;
}

// A union, not an optional voucherCode: a voucher row must carry its code, a
// listed row has none. A missing code would send the row down the listed branch
// below, so atomicClaimCampaignCode never runs — the order takes its discount
// while the code keeps redeemed_at NULL and stays spendable again (ADR-0015).
export type ResolvedCampaignRow = CampaignRedemptionFields &
  ({ kind: "listed" } | { kind: "voucher"; voucherCode: string });

// Claim each resolved campaign inside the order transaction: a voucher row
// atomically claims its single-use code; a listed row does a conditional
// increment that also passes for uncapped campaigns. Then log the applied rows
// on the order.
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
      // Listed: atomic conditional increment (uncapped campaigns pass too).
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
      // Voucher: atomic single-use claim of the specific code.
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

// Release each redemption logged on the order: a code redemption is unclaimed
// (redeemed_at/redeemed_order_id nulled), a listed redemption decrements the
// campaign's redeemed_count. Only called when a full cancel closes the order.
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

// A promo settles at drop-off once every line is priced (ADR-0018), but an
// unpaid Order's billable total can still fall afterwards — a line is cancelled
// (ADR-0008), or a price is corrected downward. If what is left no longer clears
// the minimum the promo was granted against, the promo is void. Call this from
// every path that lowers the total of an unpaid Order; a fixed-amount promo
// ("100k off, min 250k") is otherwise free money once the Order shrinks under
// the bar.
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

  // Every promo goes, not only the one that broke. Re-applying is one tap at
  // the counter and it re-checks every rule on the way back in, where
  // recomputing a stacked discount around a hole is a money bug waiting to
  // happen — and the cashier is reprinting the Receipt regardless.
  await releaseRedemptions(tx, orderId);
  await deleteOrderCampaignsByOrderId(tx, orderId);
  await tx
    .update(ordersTable)
    .set({ discount: "0", discount_source: "none" })
    .where(eq(ordersTable.id, orderId));
}
