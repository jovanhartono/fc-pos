import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import {
	numberFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import type { ReportGranularity } from "@/lib/api";
import { campaignEffectivenessQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

interface CampaignsPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

export const CampaignsPanel = ({
	from,
	to,
	storeId,
	granularity,
}: CampaignsPanelProps) => {
	const query = useQuery(
		campaignEffectivenessQueryOptions({
			from,
			to,
			store_id: storeId,
			granularity,
		}),
	);
	const data = query.data;
	const campaigns = data?.campaigns ?? [];
	const maxOrders = campaigns.reduce((m, c) => Math.max(m, c.orders), 0);

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = [
			"Campaign effectiveness,Code,Name,Orders,Revenue,Discount cost,Avg order value",
		];
		for (const c of campaigns) {
			lines.push(
				`Campaign effectiveness,${escapeCsv(c.campaign_code)},${escapeCsv(c.campaign_name)},${c.orders},${c.revenue},${c.discount_cost},${c.avg_order_value}`,
			);
		}
		downloadCsv(
			csvFilename("campaign-effectiveness", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	const totalRevenue = data?.summary.revenue ?? 0;
	const totalDiscount = data?.summary.discount_cost ?? 0;
	const roi = totalDiscount > 0 ? totalRevenue / totalDiscount : 0;

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Campaigns used"
						value={numberFormatter.format(campaigns.length)}
					/>
					<KpiCard
						label="Orders w/ campaign"
						value={numberFormatter.format(data?.summary.orders ?? 0)}
					/>
					<KpiCard
						label="Revenue attributed"
						value={formatIDRCurrency(String(totalRevenue))}
					/>
					<KpiCard
						label="Discount cost"
						value={formatIDRCurrency(String(totalDiscount))}
						helper={`ROI ${roi.toFixed(2)}×`}
					/>
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Campaign leaderboard
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{campaigns.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No campaigns redeemed.
						</p>
					) : (
						<div className="grid gap-3">
							{campaigns.map((c) => {
								const pct = maxOrders === 0 ? 0 : (c.orders / maxOrders) * 100;
								const discountRate =
									c.revenue > 0 ? c.discount_cost / c.revenue : 0;
								const campaignRoi =
									c.discount_cost > 0 ? c.revenue / c.discount_cost : 0;
								return (
									<div key={c.campaign_id} className="grid gap-1">
										<div className="flex items-center justify-between gap-2">
											<span className="flex items-center gap-2 truncate text-sm font-medium">
												<span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
													{c.campaign_code}
												</span>
												<span className="truncate">{c.campaign_name}</span>
											</span>
											<span className="flex items-center gap-3 font-mono text-sm tabular-nums">
												<span className="text-muted-foreground">
													{`${numberFormatter.format(c.orders)} orders`}
												</span>
												<span>{`${campaignRoi.toFixed(2)}×`}</span>
											</span>
										</div>
										<div className="h-1.5 w-full bg-muted">
											<div
												className="h-full bg-foreground"
												style={{ width: `${pct}%` }}
											/>
										</div>
										<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
											<span>{formatIDRCurrency(String(c.revenue))}</span>
											<span>
												{`discount ${formatIDRCurrency(String(c.discount_cost))} · ${percentFormatter.format(discountRate)}`}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};

export default CampaignsPanel;
