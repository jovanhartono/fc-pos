import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ReportOverview, reportsQueries } from "@/features/reports/api";
import { ChartCard } from "@/features/reports/components/chart-card";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	numberFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import { CHART_PALETTE } from "@/features/reports/utils/palette";
import { formatMoney } from "@/shared/money";

type TrendKey = "revenue" | "services_processed" | "orders_in" | "orders_out";

interface OverviewPanelProps {
	date: string;
	storeId?: number;
}

const formatServiceCount = (count: number) =>
	`${numberFormatter.format(count)} ${count === 1 ? "service" : "services"}`;

const CategoryBars = ({
	categories,
}: {
	categories: ReportOverview["categories"];
}) => {
	const max = categories.reduce((m, row) => Math.max(m, row.gross_sales), 0);
	if (categories.length === 0) {
		return <p className="text-sm text-muted-foreground">No sales today</p>;
	}
	return (
		<div className="grid gap-2">
			{categories.map((row) => {
				const pct = max === 0 ? 0 : (row.gross_sales / max) * 100;
				return (
					<div key={row.category_id} className="grid gap-1">
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-sm font-medium">
								{row.category_name}
							</span>
							<span className="text-sm tabular-nums">
								{formatMoney(String(row.gross_sales))}
							</span>
						</div>
						<div className="h-1.5 w-full bg-muted">
							<div
								className="h-full bg-foreground"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<span className="text-[11px] text-muted-foreground tabular-nums">
							{formatServiceCount(row.count)}
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
		return (
			<p className="text-sm text-muted-foreground">No services sold today</p>
		);
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
						<p className="text-[11px] tabular-nums text-muted-foreground">
							{formatServiceCount(row.count)}
						</p>
					</div>
					<p className="text-sm tabular-nums">
						{formatMoney(String(row.gross_sales))}
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
			<p className="text-sm text-muted-foreground">No store activity today</p>
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
								<span className="font-mono text-[11px] uppercase text-muted-foreground">
									{row.store_code}
								</span>
								<span className="truncate">{row.store_name}</span>
							</span>
							<span className="text-sm tabular-nums">
								{formatMoney(String(row.revenue))}
							</span>
						</div>
						<div className="h-1.5 w-full bg-muted">
							<div
								className="h-full bg-foreground"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
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
		reportsQueries.overview({ date, store_id: storeId, trend_days: 14 }),
	);
	const overview = overviewQuery.data;

	// Each KPI reads its last day against the one before, and shows the past
	// week as bars, all from the 14-day trend the chart below already draws.
	const trend = overview?.trend ?? [];
	const daily = overview?.daily;
	// A quiet yesterday has no percentage to compare against, and a refund-heavy
	// one (revenue below zero) would flip the sign, so the line is left off.
	const vsYesterday = (key: TrendKey) => {
		const today = trend.at(-1)?.[key];
		const yesterday = trend.at(-2)?.[key];
		if (today === undefined || yesterday === undefined || yesterday <= 0) {
			return null;
		}
		return { delta_pct: (today - yesterday) / yesterday };
	};
	const kpis: {
		key: TrendKey;
		label: string;
		helper: string;
		value: string;
	}[] = [
		{
			key: "revenue",
			label: "Revenue",
			helper: "Paid today, minus refunds",
			value: formatMoney(String(daily?.revenue ?? 0)),
		},
		{
			key: "services_processed",
			label: "Services processed",
			helper: "First reached QC",
			value: numberFormatter.format(daily?.services_processed ?? 0),
		},
		{
			key: "orders_in",
			label: "Orders in",
			helper: "Created today",
			value: numberFormatter.format(daily?.orders_in ?? 0),
		},
		{
			key: "orders_out",
			label: "Orders out",
			helper: "Picked up today",
			value: numberFormatter.format(daily?.orders_out ?? 0),
		},
	];

	const trendData = trend.map((row) => ({
		bucket: row.date,
		orders_in: row.orders_in,
		orders_out: row.orders_out,
	}));

	return (
		<div className="grid gap-6">
			<div className="flex items-end justify-between gap-3">
				<p className="text-[13px] font-medium text-muted-foreground">
					{`Snapshot · ${dayjs(date).format("MMM D, YYYY")}`}
				</p>
			</div>

			<KpiRow>
				{kpis.map((kpi) => (
					<KpiCard
						key={kpi.key}
						label={kpi.label}
						value={kpi.value}
						helper={kpi.helper}
						delta={vsYesterday(kpi.key)}
						comparisonLabel="vs yesterday"
						spark={trend.slice(-7).map((row) => row[kpi.key])}
					/>
				))}
			</KpiRow>

			<ChartCard
				variant="bar"
				title={`Orders in vs out · last ${overview?.trend_days ?? 14} days`}
				data={trendData}
				granularity="day"
				xTickInterval="equidistantPreserveStart"
				highlightLatest
				series={[
					{ key: "orders_in", label: "Orders in", color: CHART_PALETTE[0] },
					{ key: "orders_out", label: "Orders out", color: CHART_PALETTE[1] },
				]}
				valueFormatter={(v) => numberFormatter.format(v)}
			/>

			<div className="grid gap-3 xl:grid-cols-2">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-sm font-semibold text-foreground">
							Gross sales by category · today
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<CategoryBars categories={overview?.categories ?? []} />
					</CardContent>
				</Card>
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle className="text-sm font-semibold text-foreground">
							Top services by gross sales · today
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<TopServicesList services={overview?.top_services ?? []} />
					</CardContent>
				</Card>
			</div>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="text-sm font-semibold text-foreground">
						Revenue by store · today
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
