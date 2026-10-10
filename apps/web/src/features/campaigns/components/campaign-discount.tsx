import { MoneyValue } from "@/components/money-value";
import type { Campaign } from "@/features/campaigns/api";
import { formatCampaignLimits } from "@/features/campaigns/lib/campaign-text";
import { cn } from "@/lib/utils";

interface CampaignDiscountProps {
	campaign: Pick<
		Campaign,
		| "discount_type"
		| "discount_value"
		| "max_discount"
		| "min_order_total"
		| "buy_quantity"
		| "free_quantity"
	>;
	isActive: boolean;
}

const DiscountHeadline = ({
	campaign,
}: Pick<CampaignDiscountProps, "campaign">) => {
	if (campaign.discount_type === "buy_n_get_m_free") {
		return `Buy ${campaign.buy_quantity ?? "?"} get ${
			campaign.free_quantity ?? "?"
		} free`;
	}
	if (campaign.discount_type === "percentage") {
		return `${campaign.discount_value}% off`;
	}
	return (
		<>
			<MoneyValue value={campaign.discount_value} /> off
		</>
	);
};

// Green while it takes money off at checkout; an expired or archived campaign
// gives nothing, so its value goes grey.
export const CampaignDiscount = ({
	campaign,
	isActive,
}: CampaignDiscountProps) => {
	const limits = formatCampaignLimits(campaign);
	return (
		<span
			className={cn(
				"font-semibold",
				isActive
					? "text-emerald-700 dark:text-emerald-400"
					: "text-muted-foreground",
			)}
		>
			<DiscountHeadline campaign={campaign} />
			{limits && (
				<span className="block font-normal text-muted-foreground text-xs">
					{limits}
				</span>
			)}
		</span>
	);
};
