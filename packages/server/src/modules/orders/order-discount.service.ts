import { BadRequestException } from "@/http-exceptions";
import {
  getUsableCampaigns,
  resolveVoucherCode,
} from "@/modules/campaigns/campaign.service";
import type { ResolvedCampaignRow } from "@/modules/campaigns/campaign-redemption.service";
import { stackCampaignDiscounts } from "@/schema/discount";

// The checkout discount desk: the promos a cashier ticked plus the voucher slips a
// customer handed over become the rows that claim a redemption inside the order
// transaction. Deliberately touches no repository — every lookup it needs comes
// through campaign.service — so the money arithmetic here is testable without a
// database.

export interface ResolvedDiscount {
  campaignRows: ResolvedCampaignRow[];
  discountAmount: number;
  discountSource: "none" | "manual" | "campaign";
}

export async function resolveDiscount({
  campaignIds,
  voucherCodes,
  grossTotal,
  manualDiscount,
  storeId,
  storeCode,
  lines,
}: {
  campaignIds: number[];
  voucherCodes: string[];
  grossTotal: number;
  manualDiscount: number;
  storeId: number;
  storeCode: string;
  lines: { price: number; service_id: number }[];
}): Promise<ResolvedDiscount> {
  const manual = Math.max(0, manualDiscount);

  if (campaignIds.length === 0 && voucherCodes.length === 0) {
    return {
      discountAmount: manual,
      discountSource: manual > 0 ? "manual" : "none",
      campaignRows: [],
    };
  }

  const campaigns =
    campaignIds.length > 0
      ? await getUsableCampaigns({
          campaignIds,
          grossTotal,
          storeId,
          storeCode,
        })
      : [];

  // Resolve vouchers — each call validates eligibility and returns the campaign
  // (shaped like a listCampaigns item, nested eligibleServices) paired with the
  // code, which is claimed inside the tx.
  const resolvedVouchers = await Promise.all(
    voucherCodes.map((code) =>
      resolveVoucherCode(code, { storeId, storeCode, grossTotal })
    )
  );

  // order_campaigns is unique on (order_id, campaign_id): a campaign may apply at
  // most once per order. Two voucher codes from the same campaign — or a voucher
  // whose campaign is also listed — would otherwise collide on the DB constraint
  // mid-checkout (and clobber the claimed code_id). Reject up front instead.
  const allCampaignIds = [
    ...campaigns.map((campaign) => campaign.id),
    ...resolvedVouchers.map(({ campaign }) => campaign.id),
  ];
  const duplicateId = allCampaignIds.find(
    (id, index) => allCampaignIds.indexOf(id) !== index
  );
  if (duplicateId !== undefined) {
    throw new BadRequestException(
      "A campaign can only be applied once per order"
    );
  }

  // campaign_id is unique per order (the check above), so the code can be looked
  // up by campaign after stacking instead of riding along through it.
  const voucherCodeByCampaignId = new Map(
    resolvedVouchers.map(({ campaign, voucherCode }) => [
      campaign.id,
      voucherCode,
    ])
  );

  // Normalize both sources to the flat stackCampaignDiscounts input shape.
  // Listed campaigns already expose eligible_service_ids; vouchers expose the
  // nested eligibleServices -> service_id, which we flatten here.
  const stackInput = [
    ...campaigns,
    ...resolvedVouchers.map(({ campaign }) => ({
      ...campaign,
      eligible_service_ids: campaign.eligibleServices.map(
        (entry) => entry.service_id
      ),
    })),
  ];

  const { total: campaignDiscount, breakdown } = stackCampaignDiscounts(
    grossTotal,
    stackInput,
    lines
  );

  // Only campaigns that actually contributed a discount are claimed and logged.
  // stackCampaignDiscounts emits a zero-amount entry for every campaign it could
  // not apply (a voucher stacked after the order total was already fully
  // discounted, or a BOGO with no eligible line). Redeeming those would burn a
  // single-use bearer code or a usage-limit slot for no benefit.
  const campaignRows: ResolvedCampaignRow[] = breakdown
    .filter(({ amount }) => amount > 0)
    .map(({ campaign, amount }) => {
      const fields = {
        applied_amount: amount.toString(),
        campaign_id: campaign.id,
        discount_type: campaign.discount_type,
        discount_value: campaign.discount_value,
        max_discount: campaign.max_discount,
        buy_quantity: campaign.buy_quantity,
        free_quantity: campaign.free_quantity,
      };
      const voucherCode = voucherCodeByCampaignId.get(campaign.id);
      return voucherCode === undefined
        ? { ...fields, kind: "listed" as const }
        : { ...fields, kind: "voucher" as const, voucherCode };
    });

  const afterCampaign = Math.max(0, grossTotal - campaignDiscount);
  const appliedManual = Math.min(manual, afterCampaign);
  const totalDiscount = campaignDiscount + appliedManual;

  let discountSource: ResolvedDiscount["discountSource"] = "none";
  if (campaignDiscount > 0) {
    discountSource = "campaign";
  } else if (manual > 0) {
    discountSource = "manual";
  }

  return {
    discountAmount: totalDiscount,
    discountSource,
    campaignRows,
  };
}
