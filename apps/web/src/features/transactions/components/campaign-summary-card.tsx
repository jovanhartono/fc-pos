import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import type { Campaign } from "@/lib/api";
import { formatIDRCurrency } from "@/shared/utils";

interface CampaignSummaryProps {
	campaign: Campaign;
}

const Container = ({ children }: { children: React.ReactNode }) => (
	<div className="flex items-center justify-between gap-3 border border-emerald-300/60 bg-emerald-50/70 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
		{children}
	</div>
);

const Body = ({
	campaign,
	subtitle,
}: {
	campaign: Campaign;
	subtitle: string;
}) => (
	<div>
		<p className="font-medium">{campaign.name}</p>
		<p className="text-xs text-muted-foreground">
			{campaign.code} · {subtitle}
		</p>
	</div>
);

const FixedCampaignSummary = ({ campaign }: CampaignSummaryProps) => (
	<Container>
		<Body campaign={campaign} subtitle="Fixed discount" />
		<Badge variant="success">
			{formatIDRCurrency(String(campaign.discount_value))}
		</Badge>
	</Container>
);

const PercentageCampaignSummary = ({ campaign }: CampaignSummaryProps) => (
	<Container>
		<Body campaign={campaign} subtitle="Percentage discount" />
		<Badge variant="success">{campaign.discount_value}%</Badge>
	</Container>
);

const BogoCampaignSummary = ({ campaign }: CampaignSummaryProps) => {
	const buy = campaign.buy_quantity ?? 0;
	const free = campaign.free_quantity ?? 0;
	const eligibleCodes =
		campaign.eligibleServices
			?.map((entry) => entry.service?.code ?? `#${entry.service_id}`)
			.join(", ") ?? "";

	return (
		<Container>
			<Body
				campaign={campaign}
				subtitle={`Eligible: ${eligibleCodes || "—"}`}
			/>
			<Badge variant="success">
				Buy {buy} Get {free} Free
			</Badge>
		</Container>
	);
};

const summaryByType = {
	fixed: FixedCampaignSummary,
	percentage: PercentageCampaignSummary,
	buy_n_get_m_free: BogoCampaignSummary,
} as const;

export const CampaignSummaryCard = memo(
	({ campaign }: CampaignSummaryProps) => {
		const Component = summaryByType[campaign.discount_type];
		return <Component campaign={campaign} />;
	},
);

CampaignSummaryCard.displayName = "CampaignSummaryCard";
