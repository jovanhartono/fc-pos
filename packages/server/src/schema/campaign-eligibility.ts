export interface CampaignEligibilityInput {
  code: string;
  ends_at?: Date | string | null;
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
  now: Date;
  storeCode?: string;
  storeId: number;
}

// Single source of the Campaign "Usable" rules (see CONTEXT.md). The server
// wraps this in assertCampaignUsable (throws); the POS filters on null.
export function campaignIneligibilityReason(
  campaign: CampaignEligibilityInput,
  { now, grossTotal, storeId, storeCode }: CampaignEligibilityContext
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
    return `Campaign ${campaign.code} is not available for store ${
      storeCode ?? storeId
    }`;
  }

  if (grossTotal < Number(campaign.min_order_total)) {
    return `Order total does not meet minimum for campaign ${campaign.code}`;
  }

  // Listed-campaign usage-limit gate. Vouchers (code mode) enforce their cap
  // via the per-code claim, not redeemed_count, so skip them here.
  if (
    campaign.redemption_mode !== "code" &&
    campaign.usage_limit != null &&
    (campaign.redeemed_count ?? 0) >= campaign.usage_limit
  ) {
    return `Campaign ${campaign.code} has reached its usage limit`;
  }

  return null;
}
