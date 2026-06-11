export interface CampaignEligibilityInput {
  code: string;
  ends_at?: Date | string | null;
  is_active: boolean;
  min_order_total: string;
  starts_at?: Date | string | null;
  stores: { store_id: number }[];
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

  return null;
}
