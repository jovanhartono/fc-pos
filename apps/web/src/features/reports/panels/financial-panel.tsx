import { Analytics01Icon } from "@hugeicons/core-free-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { SectionTitle } from "@/components/section";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	type FinancialReport,
	type ReportGranularity,
	reportsQueries,
} from "@/features/reports/api";
import {
	BusyHoursCard,
	mondayFirst,
	WEEKDAYS,
	weekdayCounts,
} from "@/features/reports/components/busy-hours";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { MoneyWalkFlowCard } from "@/features/reports/components/money-walk-flow";
import {
	type RankRow,
	RankRows,
	shareNote,
} from "@/features/reports/components/rank-rows";
import {
	type ChartAxis,
	type ChartSeries,
	ReportChart,
	rangeAxis,
	valueAt,
} from "@/features/reports/components/report-chart";
import { StoreCategoryMixCard } from "@/features/reports/components/store-category-mix";
import { storeRankRows } from "@/features/reports/components/store-revenue-rows";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import {
	compactMoney,
	compactNumber,
	numberFormatter,
	percentFormatter,
	pluralCount,
	rangeLabel,
} from "@/features/reports/utils/format";
import {
	formatKpiDeltaChange,
	kpiDeltaChange,
} from "@/features/reports/utils/kpi-delta";
import { CONTENT_FADE, staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";
import { getPreset } from "@/shared/date-presets";

interface FinancialPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

interface DataProps {
	data: FinancialReport;
}

const ratio = (num: number, denom: number) => (denom > 0 ? num / denom : 0);

const exportCsv = (data: FinancialReport) => {
	const summary = data.summary.current;
	const prev = data.summary.previous;
	const lines: string[] = [];
	lines.push("Financial totals,Metric,Current,Previous");
	lines.push(`Totals,Gross sales,${summary.gross_sales},${prev.gross_sales}`);
	lines.push(
		`Totals,Services,${summary.services_gross_sales},${prev.services_gross_sales}`,
	);
	lines.push(
		`Totals,Products,${summary.products_gross_sales},${prev.products_gross_sales}`,
	);
	lines.push(`Totals,Discount,${summary.discount},${prev.discount}`);
	lines.push(`Totals,Collected,${summary.collected},${prev.collected}`);
	lines.push(`Totals,Refunds,${summary.refunds},${prev.refunds}`);
	lines.push(`Totals,Revenue,${summary.revenue},${prev.revenue}`);
	lines.push(`Totals,COGS,${summary.cogs},${prev.cogs}`);
	lines.push(
		`Totals,Gross profit,${summary.gross_profit},${prev.gross_profit}`,
	);
	lines.push(`Totals,Margin,${summary.margin},${prev.margin}`);
	lines.push(
		`Totals,Discount rate,${summary.discount_rate},${prev.discount_rate}`,
	);
	lines.push(`Totals,Refund rate,${summary.refund_rate},${prev.refund_rate}`);
	lines.push("");
	lines.push(
		"Financial series,Period,Services,Products,Gross sales,Discount,Collected,Refunds,Revenue,COGS,Gross profit",
	);
	for (const row of data.series) {
		lines.push(
			`Series,${escapeCsv(row.bucket)},${row.services},${row.products},${row.gross_sales},${row.discount},${row.collected},${row.refunds},${row.revenue},${row.cogs},${row.gross_profit}`,
		);
	}
	lines.push("");
	const matrix = data.store_category_matrix;
	lines.push(
		"Store × Category,Store code,Store name,Category,Gross sales,Share within store,Store total",
	);
	for (const row of matrix.rows) {
		for (const cell of row.cells) {
			const col = matrix.columns.find(
				(c) => c.category_id === cell.category_id,
			);
			lines.push(
				`Store×Category,${escapeCsv(row.store_code)},${escapeCsv(row.store_name)},${escapeCsv(col?.label ?? "")},${cell.gross_sales},${cell.share},${row.total}`,
			);
		}
	}
	lines.push("");
	lines.push("Store revenue,Store code,Store name,Revenue,Orders,Share");
	for (const row of data.store_breakdown) {
		lines.push(
			`Store,${escapeCsv(row.store_code)},${escapeCsv(row.store_name)},${row.revenue},${row.orders},${row.share}`,
		);
	}
	lines.push("");
	lines.push("Top Services,Code,Name,Gross sales,Sold,COGS");
	for (const row of data.top_services) {
		lines.push(
			`Service,${escapeCsv(row.code)},${escapeCsv(row.name)},${row.gross_sales},${row.items},${row.cogs}`,
		);
	}
	lines.push("");
	lines.push("Busy Hours,Weekday,Hour,Collected in range");
	for (const row of data.busy_hours) {
		lines.push(`Hour,${WEEKDAYS[row.weekday]},${row.hour},${row.collected}`);
	}
	lines.push("");
	lines.push("Unpaid Orders,Days since drop-off,Orders,Amount");
	for (const row of data.unpaid_orders) {
		lines.push(`Unpaid,${UNPAID_LABELS[row.key]},${row.orders},${row.amount}`);
	}
	downloadCsv(
		csvFilename("financial", data.from, data.to, data.store_id),
		lines.join("\n"),
	);
};

export const FinancialPanel = ({
	from,
	to,
	storeId,
	granularity,
}: FinancialPanelProps) => {
	const query = useQuery({
		...reportsQueries.financial({ from, to, store_id: storeId, granularity }),
		placeholderData: keepPreviousData,
	});
	const data = query.data;
	const categoryTotal =
		data?.category_treemap.reduce((sum, row) => sum + row.gross_sales, 0) ?? 0;

	return (
		<div className={cn("grid gap-6", staleFade(query.isPlaceholderData))}>
			<ExportButton disabled={!data} onClick={() => data && exportCsv(data)} />
			<HeroCard data={data} />
			<KpiGrid data={data} />
			{data ? (
				<div className={cn("grid gap-6", CONTENT_FADE)}>
					<Highlights data={data} />
					<MoneyWalkFlowCard summary={data.summary.current} />
					<div className="grid gap-6 lg:grid-cols-2">
						<WeekdayCard data={data} />
						<BusyHoursCard
							from={data.from}
							rows={data.busy_hours}
							to={data.to}
						/>
					</div>
					<div className="grid gap-6 lg:grid-cols-2">
						<RankCard
							rows={data.category_treemap.slice(0, 6).map((row) => ({
								key: row.category_id,
								name: row.category_name,
								value: row.gross_sales,
								notes: [shareNote(row.gross_sales, categoryTotal)],
							}))}
							title="Categories"
						/>
						<RankCard
							rows={storeRankRows(data.store_breakdown)}
							title="Stores"
						/>
					</div>
					<StoreCategoryMixCard matrix={data.store_category_matrix} />
					<div className="grid gap-6 lg:grid-cols-2">
						<RankCard
							rows={data.top_services.map((row) => ({
								key: row.service_id,
								code: row.code,
								name: row.name,
								value: row.gross_sales,
								notes: [
									shareNote(
										row.gross_sales,
										data.summary.current.services_gross_sales,
									),
									`${numberFormatter.format(row.items)} sold`,
								],
							}))}
							title="Top Services"
						/>
						<UnpaidOrdersCard rows={data.unpaid_orders} />
					</div>
				</div>
			) : null}
		</div>
	);
};

interface MaybeDataProps {
	data: FinancialReport | undefined;
}

type HeroMetric = "revenue" | "collected" | "gross_sales" | "gross_profit";

const HERO_NAMES: Record<HeroMetric, string> = {
	revenue: "Revenue",
	collected: "Collected",
	gross_sales: "Gross sales",
	gross_profit: "Gross profit",
};

const previousCaption = (data: FinancialReport, metric: HeroMetric) => {
	const before = `${compactMoney(data.summary.previous[metric])} in ${rangeLabel(data.previous.from, data.previous.to)}`;
	const delta = data.summary.deltas[metric];
	const change = delta ? kpiDeltaChange(delta, "percent") : null;
	return change === null
		? before
		: `${before} · ${formatKpiDeltaChange(change, "percent")}`;
};

// One chart, four measures: the owner flips the measure instead of reading
// the same totals again in strips under the chart.
const HeroCard = ({ data }: MaybeDataProps) => {
	const [metric, setMetric] = useState<HeroMetric>("revenue");
	const rows = data?.series ?? [];
	const labels = rows.map((row) => row.bucket);
	const axis = rangeAxis(data?.granularity ?? "day");
	const series: ChartSeries = {
		key: metric,
		name: HERO_NAMES[metric],
		color: "var(--chart-1)",
		values: rows.map((row) => row[metric]),
	};
	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid gap-4 p-4">
				<Tabs
					onValueChange={(value) => setMetric(value as HeroMetric)}
					value={metric}
				>
					<TabsList aria-label="Measure" className="w-full sm:w-fit">
						<TabsTrigger value="revenue">Revenue</TabsTrigger>
						<TabsTrigger value="collected">Collected</TabsTrigger>
						<TabsTrigger value="gross_sales">Gross Sales</TabsTrigger>
						<TabsTrigger value="gross_profit">Profit</TabsTrigger>
					</TabsList>
				</Tabs>
				<ReportChart
					axis={axis}
					formatAxis={compactNumber}
					groups={[[series]]}
					head={(index) => ({
						label:
							index === null ? HERO_NAMES[metric] : axis.title(labels[index]),
						value: compactMoney(valueAt(series, index)),
						caption:
							index === null && data
								? previousCaption(data, metric)
								: undefined,
					})}
					kind="line"
					labels={labels}
				/>
			</CardContent>
		</Card>
	);
};

const KpiGrid = ({ data }: MaybeDataProps) => {
	const now = data?.summary.current;
	const deltas = data?.summary.deltas;
	const orders =
		data?.store_breakdown.reduce((sum, row) => sum + row.orders, 0) ?? 0;
	const days = data
		? Math.max(dayjs(data.to).diff(dayjs(data.from), "day") + 1, 1)
		: 1;
	return (
		<KpiRow
			className="sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6"
			isPending={!data}
		>
			<KpiCard
				comparisonLabel=""
				delta={deltas?.margin ?? null}
				deltaAs="points"
				label="Margin"
				value={percentFormatter.format(now?.margin ?? 0)}
			/>
			<KpiCard
				delta={null}
				label="Orders"
				value={numberFormatter.format(orders)}
			/>
			{/* Revenue per Order, as on each Store's row below. */}
			<KpiCard
				delta={null}
				label="AOV"
				value={compactMoney(ratio(now?.revenue ?? 0, orders))}
			/>
			{/* The previous period is the same length, so Revenue's change is the
			    per-day change too. */}
			<KpiCard
				comparisonLabel=""
				delta={deltas?.revenue ?? null}
				label="Per day"
				value={compactMoney((now?.revenue ?? 0) / days)}
			/>
			<KpiCard
				comparisonLabel=""
				delta={deltas?.discount_rate ?? null}
				deltaAs="points"
				isLowerBetter
				label="Discount rate"
				value={percentFormatter.format(now?.discount_rate ?? 0)}
			/>
			<KpiCard
				comparisonLabel=""
				delta={deltas?.refund_rate ?? null}
				deltaAs="points"
				isLowerBetter
				label="Refund rate"
				value={percentFormatter.format(now?.refund_rate ?? 0)}
			/>
		</KpiRow>
	);
};

// The lines an owner would otherwise work out from the chart: the best and
// slowest stretch, how many brought in nothing, and where the month is heading.
const Highlights = ({ data }: DataProps) => {
	const earning = data.series.filter((row) => row.revenue !== 0);
	if (earning.length < 2) {
		return null;
	}
	const axis = rangeAxis(data.granularity);
	const best = earning.reduce((a, b) => (b.revenue > a.revenue ? b : a));
	const slowest = earning.reduce((a, b) => (b.revenue < a.revenue ? b : a));
	const to = dayjs(data.to);
	// Only while the month is still running: a past 1–15 Oct has a real total.
	const thisMonth = getPreset("thisMonth");
	const isMonthToDate =
		data.from === thisMonth.from &&
		data.to === thisMonth.to &&
		to.date() < to.daysInMonth();
	const lines = [
		{
			label: "Best",
			value: `${axis.title(best.bucket)} · ${compactMoney(best.revenue)}`,
		},
		{
			label: "Slowest",
			value: `${axis.title(slowest.bucket)} · ${compactMoney(slowest.revenue)}`,
		},
		{
			label: `Quiet ${data.granularity}s`,
			value: `${data.series.length - earning.length}/${data.series.length}`,
		},
		...(isMonthToDate
			? [
					{
						label: `On pace for ${to.format("MMMM")}`,
						value: compactMoney(
							(data.summary.current.revenue / to.date()) * to.daysInMonth(),
						),
					},
				]
			: []),
	];
	return (
		<section className="grid gap-2.5">
			<SectionTitle title="Highlights" />
			<dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-border/70 border-y py-3 lg:flex">
				{lines.map((line) => (
					<div className="grid gap-0.5 lg:flex-1" key={line.label}>
						<dt className="text-subhead text-muted-foreground">{line.label}</dt>
						<dd className="text-body font-medium tabular-nums">{line.value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
};

const WEEKDAY_AXIS: ChartAxis = {
	tick: (label) => label,
	title: (label) => `${label} average`,
};

// Which weekdays carry the week: a staffing question the daily line hides.
const WeekdayCard = ({ data }: DataProps) => {
	const counts = weekdayCounts(data.from, data.to);
	const totals = WEEKDAYS.map(() => 0);
	for (const row of data.series) {
		totals[mondayFirst(row.bucket)] += row.revenue;
	}
	const values = totals.map((total, index) => ratio(total, counts[index]));
	const series: ChartSeries = {
		key: "weekday",
		name: "Revenue",
		color: "var(--chart-1)",
		values,
	};
	const average = ratio(data.summary.current.revenue, data.series.length);
	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid content-start gap-4 p-4">
				<SectionTitle title="By Weekday" />
				{data.granularity === "day" ? (
					<ReportChart
						axis={WEEKDAY_AXIS}
						formatAxis={compactNumber}
						groups={[[series]]}
						head={(index) => ({
							label:
								index === null
									? "Average day"
									: WEEKDAY_AXIS.title(WEEKDAYS[index]),
							value: compactMoney(index === null ? average : values[index]),
							caption: index === null ? undefined : "Revenue",
						})}
						labels={WEEKDAYS}
					/>
				) : (
					<EmptyState icon={Analytics01Icon}>
						Shown for daily ranges.
					</EmptyState>
				)}
			</CardContent>
		</Card>
	);
};

interface RankCardProps {
	title: string;
	rows: RankRow[];
}

const RankCard = ({ title, rows }: RankCardProps) => (
	<Card className="border-border/70 py-0">
		<CardContent className="grid content-start gap-4 p-4">
			<SectionTitle title={title} />
			{rows.length === 0 ? (
				<EmptyState icon={Analytics01Icon}>No data in range.</EmptyState>
			) : (
				<RankRows rows={rows} />
			)}
		</CardContent>
	</Card>
);

const UNPAID_LABELS: Record<
	FinancialReport["unpaid_orders"][number]["key"],
	string
> = {
	week: "0–7 days",
	month: "8–30 days",
	older: "Over 30 days",
};

interface UnpaidOrdersCardProps {
	rows: FinancialReport["unpaid_orders"];
}

// Work the shop has taken in but not been paid for, as of now. The oldest
// group is red: past about 30 days the money is rarely collected.
const UnpaidOrdersCard = ({ rows }: UnpaidOrdersCardProps) => {
	const total = rows.reduce((sum, row) => sum + row.amount, 0);
	const orders = rows.reduce((sum, row) => sum + row.orders, 0);
	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid content-start gap-4 p-4">
				<SectionTitle count="now" title="Unpaid Orders" />
				<div className="grid gap-0.5">
					<p className="text-title-1 tabular-nums">{compactMoney(total)}</p>
					<p className="text-subhead text-muted-foreground tabular-nums">
						{pluralCount(orders, "Order")}, by days since drop-off
					</p>
				</div>
				<ul className="grid gap-3">
					{rows.map((row) => (
						<li className="grid gap-1" key={row.key}>
							<div className="flex items-center justify-between gap-2 text-body tabular-nums">
								<span className="font-medium">{UNPAID_LABELS[row.key]}</span>
								<span>{compactMoney(row.amount)}</span>
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-soft-bar-track">
								<div
									className={cn(
										"h-full rounded-full",
										row.key === "older" ? "bg-destructive" : "bg-primary",
									)}
									style={{ width: `${ratio(row.amount, total) * 100}%` }}
								/>
							</div>
							<p className="text-subhead tabular-nums">
								{pluralCount(row.orders, "Order")}
							</p>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
};
