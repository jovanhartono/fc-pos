import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard } from "@/features/reports/components/chart-card";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	numberFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import { CHART_PALETTE } from "@/features/reports/utils/palette";
import type { ReportOverview } from "@/lib/api";
import { reportOverviewQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

interface OverviewPanelProps {
	date: string;
	storeId?: number;
}

const CategoryBars = ({
	categories,
}: {
	categories: ReportOverview["categories"];
}) => {
	const max = categories.reduce((m, row) => Math.max(m, row.revenue), 0);
	if (categories.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">No service lines today.</p>
		);
	}
	return (
		<div className="grid gap-2">
			{categories.map((row) => {
				const pct = max === 0 ? 0 : (row.revenue / max) * 100;
				return (
					<div key={row.category_id} className="grid gap-1">
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-sm font-medium">
								{row.category_name}
							</span>
							<span className="font-mono text-sm tabular-nums">
								{formatIDRCurrency(String(row.revenue))}
							</span>
						</div>
						<div className="h-1.5 w-full bg-muted">
							<div
								className="h-full bg-foreground"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
							{`${numberFormatter.format(row.count)} lines`}
						</span>
					</div>
				);
			})}
		</div>
	);
};

const TopServicesList = ({
	services,
}: {
	services: ReportOverview["top_services"];
}) => {
	if (services.length === 0) {
		return <p className="text-sm text-muted-foreground">No services today.</p>;
	}
	return (
		<div className="grid gap-2">
			{services.map((row) => (
				<div
					key={row.service_id}
					className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0"
				>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium">{row.service_name}</p>
						<p className="font-mono text-[11px] tabular-nums text-muted-foreground">
							{`${numberFormatter.format(row.count)} sold`}
						</p>
					</div>
					<p className="font-mono text-sm tabular-nums">
						{formatIDRCurrency(String(row.revenue))}
					</p>
				</div>
			))}
		</div>
	);
};

const BranchBreakdown = ({
	perStore,
}: {
	perStore: ReportOverview["per_store"];
}) => {
	const total = perStore.reduce((s, r) => s + r.revenue, 0);
	const max = perStore.reduce((m, r) => Math.max(m, r.revenue), 0);
	if (perStore.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">No branch activity today.</p>
		);
	}
	return (
		<div className="grid gap-3">
			{perStore.map((row) => {
				const pct = max === 0 ? 0 : (row.revenue / max) * 100;
				const share = total === 0 ? 0 : row.revenue / total;
				return (
					<div key={row.store_id} className="grid gap-1">
						<div className="flex items-center justify-between gap-2">
							<span className="flex items-center gap-2 truncate text-sm font-medium">
								<span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
									{row.store_code}
								</span>
								<span className="truncate">{row.store_name}</span>
							</span>
							<span className="font-mono text-sm tabular-nums">
								{formatIDRCurrency(String(row.revenue))}
							</span>
						</div>
						<div className="h-1.5 w-full bg-muted">
							<div
								className="h-full bg-foreground"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
							<span>{`${row.orders_in} in · ${row.orders_out} out`}</span>
							<span>{percentFormatter.format(share)}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
};

export const OverviewPanel = ({ date, storeId }: OverviewPanelProps) => {
	const overviewQuery = useQuery(
		reportOverviewQueryOptions({ date, store_id: storeId, trend_days: 14 }),
	);
	const overview = overviewQuery.data;

	const trendData = (overview?.trend ?? []).map((row) => ({
		bucket: row.date,
		orders_in: row.orders_in,
		orders_out: row.orders_out,
	}));

	return (
		<div className="grid gap-6">
			<div className="flex items-end justify-between gap-3">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					{`Snapshot · ${dayjs(date).format("MMM D, YYYY")}`}
				</p>
			</div>

			<KpiRow>
				<KpiCard
					label="Net revenue"
					value={formatIDRCurrency(String(overview?.daily.revenue ?? 0))}
					helper="Paid minus refunded"
				/>
				<KpiCard
					label="Items processed"
					value={numberFormatter.format(overview?.daily.items_processed ?? 0)}
					helper="Moved to QC or ready"
				/>
				<KpiCard
					label="Orders in"
					value={numberFormatter.format(overview?.daily.orders_in ?? 0)}
					helper="Created today"
				/>
				<KpiCard
					label="Orders out"
					value={numberFormatter.format(overview?.daily.orders_out ?? 0)}
					helper="Picked up today"
				/>
			</KpiRow>

			<ChartCard
				variant="area"
				title={`Orders in vs out · last ${overview?.trend_days ?? 14} days`}
				data={trendData}
				granularity="day"
				series={[
					{ key: "orders_in", label: "Orders in", color: CHART_PALETTE[0] },
					{ key: "orders_out", label: "Orders out", color: CHART_PALETTE[1] },
				]}
				valueFormatter={(v) => numberFormatter.format(v)}
			/>

			<div className="grid gap-3 xl:grid-cols-2">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
							Revenue by category
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<CategoryBars categories={overview?.categories ?? []} />
					</CardContent>
				</Card>
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
							Top services today
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<TopServicesList services={overview?.top_services ?? []} />
					</CardContent>
				</Card>
			</div>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Revenue by branch
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					<BranchBreakdown perStore={overview?.per_store ?? []} />
				</CardContent>
			</Card>
		</div>
	);
};

export default OverviewPanel;
