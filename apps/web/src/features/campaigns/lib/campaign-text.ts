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

export const formatCampaignDiscount = (
	campaign: Pick<
		Campaign,
		| "discount_type"
		| "discount_value"
		| "max_discount"
		| "buy_quantity"
		| "free_quantity"
	>,
) => {
	if (campaign.discount_type === "buy_n_get_m_free") {
		return `Buy ${campaign.buy_quantity ?? "?"} Get ${
			campaign.free_quantity ?? "?"
		} Free`;
	}

	const discount =
		campaign.discount_type === "percentage"
			? `${campaign.discount_value}%`
			: formatMoney(String(campaign.discount_value));

	// Checkout treats a max of 0 as no cap, so the table must not read "max Rp0".
	return Number(campaign.max_discount) > 0
		? `${discount} · max ${formatMoney(String(campaign.max_discount))}`
		: discount;
};
