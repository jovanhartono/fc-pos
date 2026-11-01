import type { DbExecutor } from "@/db";
import { BadRequestException } from "@/http-exceptions";
import {
  getUsableCampaigns,
  resolveVoucherCode,
} from "@/modules/campaigns/campaign.service";
import type { ResolvedCampaignRow } from "@/modules/campaigns/campaign-redemption.service";
import { applyManualDiscount, stackCampaignDiscounts } from "@/schema/discount";

// No repository calls here, so the discount maths is testable without a database.
// The executor is passed down so eligibility is read in the transaction that
// claims the Voucher codes.

export interface ResolvedDiscount {
  campaignRows: ResolvedCampaignRow[];
  discountAmount: number;
  discountSource: "none" | "manual" | "campaign";
}

export async function resolveDiscount(
  executor: DbExecutor,
  {
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
  }
): Promise<ResolvedDiscount> {
  const manual = Math.max(0, manualDiscount);

  if (campaignIds.length === 0 && voucherCodes.length === 0) {
    // A typed discount never exceeds the Order total, matching the cap the
    // cashier saw in the POS.
    const appliedManual = Math.min(manual, grossTotal);
    return {
      discountAmount: appliedManual,
      discountSource: appliedManual > 0 ? "manual" : "none",
      campaignRows: [],
    };
  }

  const campaigns =
    campaignIds.length > 0
      ? await getUsableCampaigns(executor, {
          campaignIds,
          grossTotal,
          lines,
          storeId,
          storeCode,
        })
      : [];

  const resolvedVouchers = await Promise.all(
    voucherCodes.map((code) =>
      resolveVoucherCode(executor, code, {
        storeId,
        storeCode,
        grossTotal,
        lines,
      })
    )
  );

  // A Campaign applies once per Order. Two Voucher codes from one Campaign, or a
  // Voucher whose Campaign is also ticked, would hit the unique key mid-checkout.
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

  const voucherCodeByCampaignId = new Map(
    resolvedVouchers.map(({ campaign, voucherCode }) => [
      campaign.id,
      voucherCode,
    ])
  );

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

  // A Campaign that took nothing off (Order already fully discounted, or a BOGO
  // with no eligible line) is not claimed, or it would burn a Voucher code or a
  // Usage limit slot for nothing.
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

  const appliedManual = applyManualDiscount(
    grossTotal,
    campaignDiscount,
    manual
  );
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
