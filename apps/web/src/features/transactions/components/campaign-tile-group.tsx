import { CheckIcon } from "@phosphor-icons/react";
import type { Campaign } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatIDRCurrency } from "@/shared/utils";

const campaignDiscountLabel = (campaign: Campaign): string => {
	if (campaign.discount_type === "fixed") {
		return `-${formatIDRCurrency(String(campaign.discount_value))}`;
	}
	if (campaign.discount_type === "percentage") {
		return `-${campaign.discount_value}%`;
	}
	return `Buy ${campaign.buy_quantity ?? 0} Get ${campaign.free_quantity ?? 0}`;
};

interface CampaignTileGroupProps {
	eligibleCampaigns: Campaign[];
	selectedIds: string[];
	hasStore: boolean;
	onToggle: (campaignId: string) => void;
}

// Shared campaign picker (ADR-0018: discounts resolve at payment) — used by
// the POS pay-at-drop-off step and the order page's collect-payment form.
// Empty / no-store states via early returns; otherwise the eligible campaigns
// as a multi-select tile grid.
export const CampaignTileGroup = ({
	eligibleCampaigns,
	selectedIds,
	hasStore,
	onToggle,
}: CampaignTileGroupProps) => {
	if (!hasStore) {
		return (
			<p className="text-muted-foreground text-sm">
				Select store first to load campaigns
			</p>
		);
	}

	if (eligibleCampaigns.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No campaigns available</p>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{eligibleCampaigns.map((campaign) => {
				const campaignId = String(campaign.id);
				return (
					<CampaignTile
						code={campaign.code}
						discountLabel={campaignDiscountLabel(campaign)}
						isSelected={selectedIds.includes(campaignId)}
						key={campaign.id}
						onToggle={() => onToggle(campaignId)}
					/>
				);
			})}
		</div>
	);
};

interface CampaignTileProps {
	code: string;
	discountLabel: string;
	isSelected: boolean;
	onToggle: () => void;
}

// Multi-select tile (campaigns stack): a visually hidden checkbox wrapped by the
// styled label — native checkbox semantics + keyboard, full tile as the touch
// target. Selected = solid green; the check echoes the state.
const CampaignTile = ({
	code,
	discountLabel,
	isSelected,
	onToggle,
}: CampaignTileProps) => (
	<label
		className={cn(
			"flex min-h-12 cursor-pointer items-center justify-between gap-2 border px-3 py-2 text-left transition active:scale-[0.97] has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50",
			isSelected
				? "border-emerald-300/60 bg-emerald-50/70 text-foreground dark:border-emerald-800 dark:bg-emerald-950/30"
				: "border-border/70 text-foreground/80 hover:border-border hover:bg-muted/40",
		)}
	>
		<input
			checked={isSelected}
			className="sr-only"
			onChange={onToggle}
			type="checkbox"
		/>
		<span className="flex flex-col">
			<span className="font-medium text-sm">{code}</span>
			<span
				className={cn(
					"text-[11px]",
					isSelected
						? "text-emerald-700 dark:text-emerald-400"
						: "text-muted-foreground",
				)}
			>
				{discountLabel}
			</span>
		</span>
		{isSelected ? (
			<CheckIcon
				className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
				weight="bold"
			/>
		) : null}
	</label>
);
