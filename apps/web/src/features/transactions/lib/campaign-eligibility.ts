import {
	type CampaignEligibilityInput,
	campaignIneligibilityReason,
} from "@fresclean/api/schema";

// The one filter behind every campaign picker the cashier sees — the POS
// payment step, its pricing preview, and the order page's collect-payment
// form. All three are the same discount desk (ADR-0018: a discount settles
// once every line is priced, against the order total), so they must offer the
// same tiles.
// Voucher (code-mode) campaigns are entered by code, never listed — the
// server already omits them, but filter defensively so one can't leak in.
// No store yet means no campaigns: eligibility is per-branch.
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
