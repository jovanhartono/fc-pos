import { formatMoney } from "@/shared/money";

interface CampaignRedemptionFields {
	redemption_mode: "listed" | "code";
	usage_limit: number | null;
}

interface CampaignDiscountFields {
	discount_type: "percentage" | "fixed" | "buy_n_get_m_free";
	discount_value: string | number;
	max_discount: string | number | null;
	buy_quantity: number | null;
	free_quantity: number | null;
}

export const formatCampaignRedemption = ({
	redemption_mode,
	usage_limit,
}: CampaignRedemptionFields) => {
	if (redemption_mode === "code") {
		return "Voucher";
	}
	return usage_limit == null ? "Listed" : `Listed · limit ${usage_limit}`;
};

export const formatCampaignDiscount = (campaign: CampaignDiscountFields) => {
	if (campaign.discount_type === "buy_n_get_m_free") {
		return `Buy ${campaign.buy_quantity ?? "?"} Get ${
			campaign.free_quantity ?? "?"
		} Free`;
	}

	const discount =
		campaign.discount_type === "percentage"
			? `${campaign.discount_value}%`
			: formatMoney(String(campaign.discount_value));

	return campaign.max_discount
		? `${discount} · max ${formatMoney(String(campaign.max_discount))}`
		: discount;
};
