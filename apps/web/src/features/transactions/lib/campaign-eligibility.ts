import {
	type CampaignEligibilityInput,
	campaignIneligibilityReason,
} from "@fresclean/api/schema";

// Behind every Campaign picker, POS checkout and the Order page's Collect
// payment alike, so both offer the same tiles (ADR-0018). Vouchers are never
// listed, and no Store yet means no Campaigns.
export const filterEligibleCampaigns = <C extends CampaignEligibilityInput>(
	campaigns: C[] | undefined,
	{ grossTotal, storeId }: { grossTotal: number; storeId: number | undefined },
): C[] => {
	if (storeId === undefined) {
		return [];
	}
	const now = new Date();
	return (campaigns ?? []).filter(
		(campaign) =>
			campaign.redemption_mode !== "code" &&
			campaignIneligibilityReason(campaign, { now, grossTotal, storeId }) ===
				null,
	);
};
