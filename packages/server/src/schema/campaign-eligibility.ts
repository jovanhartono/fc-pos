import { bogoFreeCount, type CampaignDiscountInput } from "@/schema/discount";

export interface CampaignEligibilityInput {
  buy_quantity?: number | null;
  code: string;
  discount_type: CampaignDiscountInput["discount_type"];
  eligibleServices: { service_id: number }[];
  ends_at?: Date | string | null;
  free_quantity?: number | null;
  is_active: boolean;
  min_order_total: string;
  redeemed_count?: number;
  redemption_mode?: "listed" | "code";
  starts_at?: Date | string | null;
  stores: { store_id: number }[];
  usage_limit?: number | null;
}

export interface CampaignEligibilityContext {
  grossTotal: number;
  // The Order's BOGO slot lines (isBogoSlot), the same list the discount is
  // computed from.
  lines: { service_id: number }[];
  now: Date;
  storeCode?: string;
  storeId: number;
}

// A buy 4 get 1 shown with three Services would promise a free Item the
// Order can't earn.
function bogoIneligibilityReason(
  campaign: CampaignEligibilityInput,
  lines: { service_id: number }[]
): string | null {
  if (campaign.discount_type !== "buy_n_get_m_free") {
    return null;
  }
  const eligibleIds = new Set(
    campaign.eligibleServices.map((entry) => entry.service_id)
  );
  const eligibleCount = lines.filter((line) =>
    eligibleIds.has(line.service_id)
  ).length;
  if (bogoFreeCount(campaign, eligibleCount) > 0) {
    return null;
  }
  const needed = (campaign.buy_quantity ?? 0) + (campaign.free_quantity ?? 0);
  return `Campaign ${campaign.code} needs ${needed} eligible Services`;
}

// Single source of the Campaign "Usable" rules (see ADR-0015). The server
// wraps this in assertCampaignUsable (throws); the POS filters on null.
export function campaignIneligibilityReason(
  campaign: CampaignEligibilityInput,
  { now, grossTotal, lines, storeId, storeCode }: CampaignEligibilityContext
): string | null {
  if (!campaign.is_active) {
    return `Campaign ${campaign.code} is not active`;
  }
  if (campaign.starts_at && now < new Date(campaign.starts_at)) {
    return `Campaign ${campaign.code} has not started yet`;
  }
  if (campaign.ends_at && now > new Date(campaign.ends_at)) {
    return `Campaign ${campaign.code} has ended`;
  }

  const storeScopes = campaign.stores.map((item) => item.store_id);
  if (storeScopes.length > 0 && !storeScopes.includes(storeId)) {
    return `Campaign ${campaign.code} doesn't run at ${storeCode ?? storeId}`;
  }

  if (grossTotal < Number(campaign.min_order_total)) {
    return `Order total does not meet minimum for campaign ${campaign.code}`;
  }

  // A Voucher is capped by claiming its codes, not by redeemed_count.
  if (
    campaign.redemption_mode !== "code" &&
    campaign.usage_limit != null &&
    (campaign.redeemed_count ?? 0) >= campaign.usage_limit
  ) {
    return `Campaign ${campaign.code} has reached its usage limit`;
  }

  return bogoIneligibilityReason(campaign, lines);
}
