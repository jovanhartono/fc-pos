import type { Campaign } from "@/features/campaigns/api";
import { formatMoney } from "@/shared/money";

export const formatCampaignRedemption = ({
	redemption_mode,
	usage_limit,
}: Pick<Campaign, "redemption_mode" | "usage_limit">) => {
	if (redemption_mode === "code") {
		return "Voucher";
	}
	return usage_limit == null ? "Listed" : `Listed · limit ${usage_limit}`;
};

// The grey line under a campaign's discount. Checkout treats a max or a
// minimum of 0 as none, so the list must not read "max Rp 0".
export const formatCampaignLimits = (
	campaign: Pick<Campaign, "max_discount" | "min_order_total">,
) =>
	[
		Number(campaign.max_discount) > 0
			? `max ${formatMoney(String(campaign.max_discount))}`
			: null,
		Number(campaign.min_order_total) > 0
			? `min ${formatMoney(String(campaign.min_order_total))}`
			: null,
	]
		.filter(Boolean)
		.join(" · ");
