import { CheckIcon } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Campaign } from "@/features/campaigns/api";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

const campaignDiscountLabel = (campaign: Campaign): string => {
	if (campaign.discount_type === "fixed") {
		return `-${formatMoney(String(campaign.discount_value))}`;
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
	isLoading: boolean;
	onToggle: (campaignId: string) => void;
}

// Every state is one tile tall, so the form below doesn't jump when a
// cashier opens Collect payment and the campaigns arrive.
const EMPTY_CLASS =
	"flex min-h-13 items-center text-muted-foreground text-body";

// Shared campaign picker (ADR-0018: a discount settles once every line is
// priced) — used by the POS checkout step and the order page's
// collect-payment form.
// Empty / no-store states via early returns; otherwise the eligible campaigns
// as a multi-select tile grid.
export const CampaignTileGroup = ({
	eligibleCampaigns,
	selectedIds,
	hasStore,
	isLoading,
	onToggle,
}: CampaignTileGroupProps) => {
	if (!hasStore) {
		return <p className={EMPTY_CLASS}>Select store first to load campaigns</p>;
	}

	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
				<Skeleton className="h-13" />
			</div>
		);
	}

	if (eligibleCampaigns.length === 0) {
		return <p className={EMPTY_CLASS}>No campaigns available</p>;
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
			"flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left transition active:scale-[0.97] has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/50",
			isSelected
				? "border-success/40 bg-tone-good text-foreground"
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
			<span className="font-medium text-body">{code}</span>
			<span
				className={cn(
					"text-caption",
					isSelected ? "text-tone-good-foreground" : "text-muted-foreground",
				)}
			>
				{discountLabel}
			</span>
		</span>
		{isSelected ? (
			<CheckIcon
				className="size-4 shrink-0 text-tone-good-foreground"
				weight="bold"
			/>
		) : null}
	</label>
);
