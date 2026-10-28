import { GridViewIcon, ToolsIcon } from "@hugeicons/core-free-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ReportOverview, reportsQueries } from "@/features/reports/api";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { StoreRevenueRows } from "@/features/reports/components/store-revenue-rows";
import { numberFormatter } from "@/features/reports/utils/format";
import { staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";
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
		return <EmptyState icon={GridViewIcon}>No sales today</EmptyState>;
	}
	return (
		<div className="grid grid-cols-1 gap-2">
			{categories.map((row) => {
				const pct = max === 0 ? 0 : (row.gross_sales / max) * 100;
				return (
					<div key={row.category_id} className="grid gap-1">
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-body font-medium">
								{row.category_name}
							</span>
							<span className="text-body tabular-nums">
								{formatMoney(String(row.gross_sales))}
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-bar-track">
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<span className="text-subhead tabular-nums">
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
		return <EmptyState icon={ToolsIcon}>No services sold today</EmptyState>;
	}
	return (
		<div className="grid grid-cols-1 gap-2">
			{services.map((row) => (
				<div
					key={row.service_id}
					className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0"
				>
					<div className="min-w-0">
						<p className="truncate text-body font-medium">{row.service_name}</p>
						<p className="text-subhead tabular-nums">
							{formatServiceCount(row.count)}
						</p>
					</div>
					<p className="text-body tabular-nums">
						{formatMoney(String(row.gross_sales))}
					</p>
				</div>
			))}
		</div>
	);
};

export const OverviewPanel = ({ date, storeId }: OverviewPanelProps) => {
	const overviewQuery = useQuery({
		...reportsQueries.overview({ date, store_id: storeId, trend_days: 7 }),
		placeholderData: keepPreviousData,
	});
	const overview = overviewQuery.data;

	// Each KPI reads its last day against the one before, and shows the past
	// week as bars, all from one 7-day trend.
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
		return {
			current: today,
			previous: yesterday,
			delta_pct: (today - yesterday) / yesterday,
		};
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

	return (
		<div
			className={cn("grid gap-6", staleFade(overviewQuery.isPlaceholderData))}
		>
			<div className="flex items-end justify-between gap-3">
				<p className="text-subhead font-medium text-muted-foreground">
					{`Snapshot · ${dayjs(date).format("MMM D, YYYY")}`}
				</p>
			</div>

			<KpiRow isPending={!overview}>
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

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle>Revenue by Store · Today</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					<StoreRevenueRows rows={overview?.per_store ?? []} />
				</CardContent>
			</Card>

			<div className="grid gap-3 xl:grid-cols-2">
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle>Gross Sales by Category · Today</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<CategoryBars categories={overview?.categories ?? []} />
					</CardContent>
				</Card>
				<Card className="border-border/70">
					<CardHeader>
						<CardTitle>Top Services by Gross Sales · Today</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<TopServicesList services={overview?.top_services ?? []} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
};
