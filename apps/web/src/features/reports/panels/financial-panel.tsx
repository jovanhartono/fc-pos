import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Sankey,
	XAxis,
	YAxis,
} from "recharts";
import { SectionTitle } from "@/components/section";
import { Card, CardContent } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	type FinancialReport,
	type KpiDelta,
	type ReportGranularity,
	reportsQueries,
} from "@/features/reports/api";
import { ExportButton } from "@/features/reports/components/export-button";
import { DeltaLine } from "@/features/reports/components/kpi-card";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import {
	compactMoney,
	compactNumber,
	fixedPercentFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import {
	bucketToLabel,
	bucketToTooltipLabel,
} from "@/features/reports/utils/granularity";
import type { DeltaAs } from "@/features/reports/utils/kpi-delta";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface FinancialPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

type SummaryCurrent = FinancialReport["summary"]["current"];
type FinancialBucket = FinancialReport["series"][number];

const pctChange = (pct: number | null | undefined): number | null =>
	pct === null || pct === undefined ? null : pct * 100;

const safeRatio = (num: number, denom: number): number =>
	denom > 0 ? num / denom : 0;

const formatPreviousRangeLabel = (from: string, to: string): string => {
	const f = dayjs(from);
	const t = dayjs(to);
	if (f.month() === t.month() && f.year() === t.year()) {
		return `${f.format("MMM D")}-${t.format("D")}`;
	}
	return `${f.format("MMM D")}-${t.format("MMM D")}`;
};

export const FinancialPanel = ({
	from,
	to,
	storeId,
	granularity,
}: FinancialPanelProps) => {
	const query = useQuery(
		reportsQueries.financial({ from, to, store_id: storeId, granularity }),
	);
	const data = query.data;
	const storeBreakdown = data?.store_breakdown ?? [];
	const storeMax = storeBreakdown.reduce((m, r) => Math.max(m, r.revenue), 0);

	const handleExport = () => {
		if (!data) {
			return;
		}
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
		for (const row of storeBreakdown) {
			lines.push(
				`Store,${escapeCsv(row.store_code)},${escapeCsv(row.store_name)},${row.revenue},${row.orders},${row.share}`,
			);
		}
		downloadCsv(
			csvFilename("financial", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className="grid gap-6">
			<KpiStrip data={data} storeId={storeId} />
			<ExportButton disabled={!data} onClick={handleExport} />
			<RevenueBreakdownCard data={data} />
			<BranchCategoryMatrix data={data} />
			<BranchList rows={storeBreakdown} max={storeMax} />
		</div>
	);
};

interface RevenueBreakdownCardProps {
	data: FinancialReport | undefined;
}

const RevenueBreakdownCard = ({ data }: RevenueBreakdownCardProps) => {
	const summary = data?.summary.current;
	const deltas = data?.summary.deltas;

	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid gap-5 p-4">
				<SectionTitle title="Gross sales → Gross profit" />

				<RevenueLineChart
					series={data?.series ?? []}
					granularity={data?.granularity ?? "day"}
				/>

				<StatStrip
					title="Gross sales → Collected → Revenue"
					cells={[
						{
							label: "Gross sales",
							value: summary?.gross_sales ?? 0,
							delta: deltas?.gross_sales,
						},
						{
							label: "Collected",
							value: summary?.collected ?? 0,
							delta: deltas?.collected,
						},
						{
							label: "Revenue",
							value: summary?.revenue ?? 0,
							delta: deltas?.revenue,
						},
					]}
				/>

				<SankeyFlow summary={summary} />

				<StatStrip
					title="Deductions & margin"
					cells={[
						{
							label: "Discount",
							value: summary?.discount ?? 0,
							delta: deltas?.discount,
							invertDelta: true,
						},
						{
							label: "COGS",
							value: summary?.cogs ?? 0,
							delta: deltas?.cogs,
							invertDelta: true,
						},
						{
							label: "Refunds",
							value: summary?.refunds ?? 0,
							delta: deltas?.refunds,
							invertDelta: true,
						},
						{
							label: "Margin",
							value: summary?.margin ?? 0,
							delta: deltas?.margin,
							isPercent: true,
						},
					]}
				/>
			</CardContent>
		</Card>
	);
};

const GROSS_COLOR = "var(--muted-foreground)";
const COLLECTED_COLOR = "var(--chart-1)";
const REVENUE_COLOR = "var(--chart-2)";

const LINE_CHART_CONFIG: ChartConfig = {
	gross_sales: { label: "Gross sales", color: GROSS_COLOR },
	collected: { label: "Collected", color: COLLECTED_COLOR },
	revenue: { label: "Revenue", color: REVENUE_COLOR },
};

interface RevenueLineChartProps {
	series: FinancialBucket[];
	granularity: ReportGranularity;
}

const RevenueLineChart = ({ series, granularity }: RevenueLineChartProps) => {
	const isEmpty =
		series.length === 0 ||
		series.every(
			(row) =>
				row.gross_sales === 0 && row.collected === 0 && row.revenue === 0,
		);
	if (isEmpty) {
		return (
			<div className="flex h-60 items-center justify-center rounded-md border border-border/40 text-body text-muted-foreground">
				No sales in range.
			</div>
		);
	}
	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-subhead font-medium text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<span
						className="h-0.5 w-3"
						style={{ backgroundColor: GROSS_COLOR, opacity: 0.6 }}
					/>
					Gross
				</span>
				<span className="flex items-center gap-1.5">
					<span
						className="h-0.5 w-3"
						style={{ backgroundColor: COLLECTED_COLOR }}
					/>
					Collected
				</span>
				<span className="flex items-center gap-1.5">
					<span
						className="h-0.5 w-3"
						style={{ backgroundColor: REVENUE_COLOR }}
					/>
					Revenue
				</span>
			</div>
			<ChartContainer
				className="h-60 min-h-60 min-w-0 w-full aspect-auto"
				config={LINE_CHART_CONFIG}
				style={{ height: 240, minHeight: 240, minWidth: 0 }}
			>
				<LineChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
					<CartesianGrid vertical={false} strokeDasharray="3 3" />
					<XAxis
						axisLine={false}
						dataKey="bucket"
						minTickGap={24}
						tickFormatter={(value: string) => bucketToLabel(value, granularity)}
						tickLine={false}
						tickMargin={8}
					/>
					<YAxis
						axisLine={false}
						tickFormatter={(v: number) => compactNumber(v)}
						tickLine={false}
						tickMargin={8}
						width={56}
					/>
					<ChartTooltip
						content={
							<ChartTooltipContent
								formatter={(value, name) => (
									<div className="flex flex-1 items-center justify-between gap-3">
										<span className="text-muted-foreground">
											{LINE_CHART_CONFIG[name as string]?.label ?? name}
										</span>
										<span className="font-medium text-foreground tabular-nums">
											{formatMoney(String(Number(value)))}
										</span>
									</div>
								)}
								labelFormatter={(value) =>
									bucketToTooltipLabel(value as string, granularity)
								}
							/>
						}
						cursor={false}
					/>
					<Line
						dataKey="gross_sales"
						dot={false}
						stroke={GROSS_COLOR}
						strokeOpacity={0.6}
						strokeWidth={1.5}
						type="monotone"
					/>
					<Line
						dataKey="collected"
						dot={false}
						stroke={COLLECTED_COLOR}
						strokeWidth={1.75}
						type="monotone"
					/>
					<Line
						dataKey="revenue"
						dot={false}
						stroke={REVENUE_COLOR}
						strokeWidth={2}
						type="monotone"
					/>
				</LineChart>
			</ChartContainer>
		</div>
	);
};

interface SankeyNodeDatum {
	name: string;
	displayValue: number;
	color: string;
	labelTone: string;
}

interface SankeyFlowProps {
	summary: SummaryCurrent | undefined;
}

interface SankeyLinkDatum {
	source: number;
	target: number;
	value: number;
	color: string;
	opacity: number;
}

interface SankeyLinkRenderProps {
	sourceX: number;
	targetX: number;
	sourceY: number;
	targetY: number;
	sourceControlX: number;
	targetControlX: number;
	linkWidth: number;
	payload: unknown;
}

const SankeyFlow = ({ summary }: SankeyFlowProps) => {
	const sectionLabel = (
		<SectionTitle
			as="h3"
			count="green retained · red deductions"
			title="Flow"
		/>
	);

	if (!summary || summary.gross_sales <= 0) {
		return (
			<div className="grid gap-2">
				{sectionLabel}
				<div className="flex h-60 items-center justify-center rounded-md border border-border/40 text-body text-muted-foreground">
					No sales to flow.
				</div>
			</div>
		);
	}

	const hasRevenue = summary.revenue > 0;
	const revenuePositive = Math.max(summary.revenue, 0);
	const grossProfitPositive = hasRevenue
		? Math.max(summary.gross_profit, 0)
		: 0;

	const baseNodes: SankeyNodeDatum[] = [
		{
			name: "Gross sales",
			displayValue: summary.gross_sales,
			color: "var(--muted-foreground)",
			labelTone: "var(--muted-foreground)",
		},
		{
			name: "Discount",
			displayValue: summary.discount,
			color: "var(--destructive)",
			labelTone: "var(--destructive)",
		},
		{
			name: "Collected",
			displayValue: summary.collected,
			color: "var(--success)",
			labelTone: "var(--success)",
		},
		{
			name: "Refunds",
			displayValue: summary.refunds,
			color: "var(--destructive)",
			labelTone: "var(--destructive)",
		},
	];
	// Refunds at or above what was collected leave nothing to walk down further.
	const nodes: SankeyNodeDatum[] = hasRevenue
		? [
				...baseNodes,
				{
					name: "Revenue",
					displayValue: revenuePositive,
					color: "var(--success)",
					labelTone: "var(--success)",
				},
				{
					name: "COGS",
					displayValue: summary.cogs,
					color: "var(--destructive)",
					labelTone: "var(--destructive)",
				},
				{
					name: "Gross profit",
					displayValue: grossProfitPositive,
					color: "var(--success)",
					labelTone: "var(--success)",
				},
			]
		: baseNodes;

	const baseLinks: SankeyLinkDatum[] = [
		{
			source: 0,
			target: 1,
			value: summary.discount,
			color: "var(--destructive)",
			opacity: 0.28,
		},
		{
			source: 0,
			target: 2,
			value: summary.collected,
			color: "var(--success)",
			opacity: 0.24,
		},
		{
			source: 2,
			target: 3,
			value: summary.refunds,
			color: "var(--destructive)",
			opacity: 0.28,
		},
	];
	const linkCandidates: SankeyLinkDatum[] = hasRevenue
		? [
				...baseLinks,
				{
					source: 2,
					target: 4,
					value: revenuePositive,
					color: "var(--success)",
					opacity: 0.34,
				},
				{
					source: 4,
					target: 5,
					value: summary.cogs,
					color: "var(--destructive)",
					opacity: 0.28,
				},
				{
					source: 4,
					target: 6,
					value: grossProfitPositive,
					color: "var(--success)",
					opacity: 0.34,
				},
			]
		: baseLinks;
	const links = linkCandidates.filter((l) => l.value > 0);

	if (links.length === 0) {
		return (
			<div className="grid gap-2">
				{sectionLabel}
				<div className="flex h-60 items-center justify-center rounded-md border border-border/40 text-body text-muted-foreground">
					No sales to flow.
				</div>
			</div>
		);
	}

	return (
		<div className="grid gap-2">
			{sectionLabel}
			<div className="h-80 min-h-80 min-w-0 w-full overflow-visible">
				<ResponsiveContainer
					height={320}
					initialDimension={{ height: 320, width: 720 }}
					minWidth={0}
					width="100%"
				>
					<Sankey
						data={{ nodes, links }}
						link={(props) => <SankeyLink {...props} />}
						margin={{ bottom: 32, left: 8, right: 156, top: 12 }}
						node={(props) => <SankeyNode {...props} />}
						nodePadding={24}
						nodeWidth={6}
					/>
				</ResponsiveContainer>
			</div>
		</div>
	);
};

const SankeyLink = ({
	sourceX,
	targetX,
	sourceY,
	targetY,
	sourceControlX,
	targetControlX,
	linkWidth,
	payload,
}: SankeyLinkRenderProps) => {
	const datum = payload as SankeyLinkDatum;
	const path = `M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;

	return (
		<path
			d={path}
			fill="none"
			stroke={datum.color}
			strokeLinecap="butt"
			strokeOpacity={datum.opacity}
			strokeWidth={Math.max(linkWidth, 1)}
		/>
	);
};

interface SankeyNodeRenderProps {
	x: number;
	y: number;
	width: number;
	height: number;
	payload: unknown;
}

const SankeyNode = ({
	x,
	y,
	width,
	height,
	payload,
}: SankeyNodeRenderProps) => {
	const datum = payload as SankeyNodeDatum;
	const labelX = x + width + 6;
	const labelY = y + height / 2;
	return (
		<g>
			<rect
				fill={datum.color}
				height={height}
				opacity={0.95}
				width={width}
				x={x}
				y={y}
			/>
			<text fontSize={11} x={labelX} y={labelY - 1}>
				<tspan fill={datum.labelTone}>{datum.name}</tspan>
			</text>
			<text fontSize={11} fontWeight={600} x={labelX} y={labelY + 12}>
				<tspan className="tabular-nums" fill="var(--foreground)">
					{compactMoney(datum.displayValue)}
				</tspan>
			</text>
		</g>
	);
};

interface StatCell {
	label: string;
	value: number;
	delta?: Pick<KpiDelta, "delta_pct"> | null;
	invertDelta?: boolean;
	isPercent?: boolean;
}

interface StatStripProps {
	title: string;
	cells: StatCell[];
}

const StatStrip = ({ title, cells }: StatStripProps) => (
	<div className="grid gap-3">
		<SectionTitle as="h3" title={title} />
		<div
			className={cn(
				"grid grid-cols-2",
				cells.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4",
			)}
		>
			{cells.map((cell, idx) => (
				<div
					className={cn(
						"grid gap-1 px-3 py-2 sm:px-4",
						idx > 0 && "lg:border-l lg:border-border/40",
					)}
					key={cell.label}
				>
					<p className="text-subhead font-medium text-muted-foreground">
						{cell.label}
					</p>
					<p className="break-all text-headline font-semibold tabular-nums">
						{cell.isPercent
							? percentFormatter.format(cell.value)
							: compactMoney(cell.value)}
					</p>
					<DeltaLine
						change={pctChange(cell.delta?.delta_pct)}
						isLowerBetter={cell.invertDelta}
					/>
				</div>
			))}
		</div>
	</div>
);

interface KpiStripProps {
	data: FinancialReport | undefined;
	storeId?: number;
}

interface KpiCellModel {
	label: string;
	value: string;
	change: number | null;
	deltaAs?: DeltaAs;
	isLowerBetter?: boolean;
}

const KpiStrip = ({ data, storeId }: KpiStripProps) => {
	const cells = useMemo<KpiCellModel[]>(() => {
		if (!data) {
			return [];
		}
		const summary = data.summary.current;
		const prev = data.summary.previous;
		const deltas = data.summary.deltas;
		const totalOrders = storeId
			? (data.store_breakdown.find((r) => r.store_id === storeId)?.orders ?? 0)
			: data.store_breakdown.reduce((s, r) => s + r.orders, 0);
		const aov = safeRatio(summary.collected, totalOrders);
		const refundRate = safeRatio(summary.refunds, summary.collected);
		const prevRefundRate = safeRatio(prev.refunds, prev.collected);
		return [
			{
				label: "Collected",
				value: compactMoney(summary.collected),
				change: pctChange(deltas.collected?.delta_pct),
			},
			{
				label: "Revenue",
				value: compactMoney(summary.revenue),
				change: pctChange(deltas.revenue?.delta_pct),
			},
			{
				label: "Margin",
				value: percentFormatter.format(summary.margin),
				change: (summary.margin - prev.margin) * 100,
				deltaAs: "points",
			},
			{
				label: "Orders",
				value: totalOrders.toLocaleString("id-ID"),
				change: null,
			},
			{
				label: "AOV",
				value: compactMoney(aov),
				change: null,
			},
			{
				label: "COGS",
				value: compactMoney(summary.cogs),
				change: pctChange(deltas.cogs?.delta_pct),
				isLowerBetter: true,
			},
			{
				label: "Refund rate",
				value: percentFormatter.format(refundRate),
				change: (refundRate - prevRefundRate) * 100,
				deltaAs: "points",
				isLowerBetter: true,
			},
		];
	}, [data, storeId]);

	const previousLabel = data
		? formatPreviousRangeLabel(data.previous.from, data.previous.to)
		: "";

	if (!data) {
		return (
			<Card className="border-border/70 py-0">
				<CardContent className="grid h-30 place-items-center p-4">
					<p className="text-body text-muted-foreground">Loading totals…</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid gap-0 p-0">
				<div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
					<SectionTitle count={`vs ${previousLabel}`} title="Totals" />
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7">
					{cells.map((cell, idx) => (
						<div
							className={cn(
								"grid gap-1 px-4 py-4",
								idx > 0 && "xl:border-l xl:border-border/40",
							)}
							key={cell.label}
						>
							<p className="text-subhead font-medium text-muted-foreground">
								{cell.label}
							</p>
							<p className="break-all text-headline font-semibold tabular-nums">
								{cell.value}
							</p>
							<DeltaLine
								change={cell.change}
								deltaAs={cell.deltaAs}
								isLowerBetter={cell.isLowerBetter}
							/>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
};

type StoreCategoryMatrix = FinancialReport["store_category_matrix"];
type MatrixColumn = StoreCategoryMatrix["columns"][number];
type MatrixRow = StoreCategoryMatrix["rows"][number];

interface BranchCategoryMatrixProps {
	data: FinancialReport | undefined;
}

type MatrixDisplayMode = "share" | "amount";

const BranchCategoryMatrix = ({ data }: BranchCategoryMatrixProps) => {
	const [mode, setMode] = useState<MatrixDisplayMode>("share");
	const matrix = data?.store_category_matrix;
	const columns = matrix?.columns ?? [];
	const rows = matrix?.rows ?? [];
	const omittedStores = matrix?.omitted_stores ?? 0;

	const grandTotal = rows.reduce((s, r) => s + r.total, 0);
	const columnTotals = columns.map((col) =>
		rows.reduce((s, r) => {
			const cell = r.cells.find((c) => c.category_id === col.category_id);
			return s + (cell?.gross_sales ?? 0);
		}, 0),
	);

	const isEmpty = rows.length === 0 || grandTotal === 0;

	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid gap-3 p-4">
				<div className="flex items-start justify-between gap-3">
					<SectionTitle
						count={`${mode === "share" ? "share within store" : "gross sales (Rp)"} · top ${columns.length} categor${columns.length === 1 ? "y" : "ies"}`}
						title="Store × Category"
					/>
					<MatrixModeToggle mode={mode} onChange={setMode} />
				</div>

				{isEmpty ? (
					<p className="text-body text-muted-foreground">
						{"// no category gross sales in range"}
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full border-separate border-spacing-0 text-subhead tabular-nums">
							<thead>
								<tr>
									<th
										className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left text-subhead font-medium text-muted-foreground"
										scope="col"
									>
										Store
									</th>
									{columns.map((col) => (
										<MatrixHeaderCell column={col} key={col.category_id} />
									))}
									<th
										className="border-l border-border/40 px-2 py-1.5 text-right text-subhead font-medium text-muted-foreground"
										scope="col"
									>
										Total
									</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<MatrixBranchRow
										columns={columns}
										grandTotal={grandTotal}
										key={row.store_id}
										mode={mode}
										row={row}
									/>
								))}
							</tbody>
							<tfoot>
								<tr>
									<th
										className="sticky left-0 z-10 border-t border-border/40 bg-card px-2 py-2 text-left text-subhead font-medium text-muted-foreground"
										scope="row"
									>
										Total
									</th>
									{columns.map((col, idx) => (
										<td
											className="border-t border-border/40 px-2 py-2 text-center font-semibold"
											key={col.category_id}
										>
											{compactMoney(columnTotals[idx] ?? 0)}
										</td>
									))}
									<td className="border-l border-t border-border/40 px-2 py-2 text-right font-semibold">
										{compactMoney(grandTotal)}
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
				)}

				{omittedStores > 0 ? (
					<p className="text-subhead font-medium text-muted-foreground">
						{`(+${omittedStores} store${omittedStores === 1 ? "" : "s"} not shown)`}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
};

interface MatrixModeToggleProps {
	mode: MatrixDisplayMode;
	onChange: (mode: MatrixDisplayMode) => void;
}

const MatrixModeToggle = ({ mode, onChange }: MatrixModeToggleProps) => (
	<div className="inline-flex shrink-0 rounded-[9px] bg-secondary p-0.5 text-subhead">
		<button
			aria-pressed={mode === "share"}
			className={cn(
				"rounded-[7px] px-2.5 py-1",
				mode === "share"
					? "bg-primary text-primary-foreground"
					: "text-muted-foreground hover:text-foreground",
			)}
			onClick={() => onChange("share")}
			type="button"
		>
			%
		</button>
		<button
			aria-pressed={mode === "amount"}
			className={cn(
				"rounded-[7px] px-2.5 py-1",
				mode === "amount"
					? "bg-primary text-primary-foreground"
					: "text-muted-foreground hover:text-foreground",
			)}
			onClick={() => onChange("amount")}
			type="button"
		>
			Rp
		</button>
	</div>
);

interface MatrixHeaderCellProps {
	column: MatrixColumn;
}

const MatrixHeaderCell = ({ column }: MatrixHeaderCellProps) => (
	<th
		className="min-w-28 px-3 py-2 text-center align-bottom text-subhead font-medium text-muted-foreground"
		scope="col"
		title={column.label}
	>
		<span className="block max-w-36 whitespace-normal break-words leading-tight">
			{column.label}
		</span>
	</th>
);

interface MatrixBranchRowProps {
	row: MatrixRow;
	columns: MatrixColumn[];
	grandTotal: number;
	mode: MatrixDisplayMode;
}

const MatrixBranchRow = ({
	row,
	columns,
	grandTotal,
	mode,
}: MatrixBranchRowProps) => (
	<tr className="group">
		<th
			className="sticky left-0 z-10 border-t border-border/40 bg-card px-2 py-2 text-left align-top group-hover:bg-muted/40"
			scope="row"
		>
			<span className="block tabular-nums">{row.store_code}</span>
			<span className="block max-w-35 truncate text-foreground">
				{row.store_name}
			</span>
		</th>
		{columns.map((col) => {
			const cell = row.cells.find((c) => c.category_id === col.category_id);
			return (
				<MatrixCell
					branchTotal={row.total}
					cellGrossSales={cell?.gross_sales ?? 0}
					cellShare={cell?.share ?? 0}
					columnLabel={col.label}
					grandTotal={grandTotal}
					key={col.category_id}
					mode={mode}
					storeCode={row.store_code}
					storeName={row.store_name}
				/>
			);
		})}
		<td className="border-l border-t border-border/40 px-2 py-2 text-right font-semibold group-hover:bg-muted/40">
			{compactMoney(row.total)}
		</td>
	</tr>
);

interface MatrixCellProps {
	cellShare: number;
	cellGrossSales: number;
	branchTotal: number;
	grandTotal: number;
	columnLabel: string;
	storeCode: string;
	storeName: string;
	mode: MatrixDisplayMode;
}

const MatrixCell = ({
	cellShare,
	cellGrossSales,
	branchTotal,
	grandTotal,
	columnLabel,
	storeCode,
	storeName,
	mode,
}: MatrixCellProps) => {
	const opacity = cellGrossSales === 0 ? 0 : Math.max(0.05, cellShare ** 0.7);
	const isInverted = opacity > 0.35;
	const branchShare = branchTotal > 0 ? cellShare : 0;
	const grandShare = grandTotal > 0 ? cellGrossSales / grandTotal : 0;
	const tooltip = `${storeCode} ${storeName} · ${columnLabel}\nRp ${cellGrossSales.toLocaleString("id-ID")} · ${fixedPercentFormatter.format(branchShare)} of branch · ${fixedPercentFormatter.format(grandShare)} of total`;

	const display =
		cellGrossSales === 0
			? "·"
			: mode === "share"
				? `${Math.round(cellShare * 100)}%`
				: compactMoney(cellGrossSales);

	return (
		<td
			className="relative border-t border-border/40 px-2 py-2 text-center align-middle"
			title={tooltip}
		>
			<div
				aria-hidden
				className="absolute inset-0"
				style={{ backgroundColor: "var(--primary)", opacity }}
			/>
			<span
				className={cn(
					"relative",
					isInverted ? "text-primary-foreground" : "text-foreground",
					cellGrossSales === 0 && "text-muted-foreground",
				)}
			>
				{display}
			</span>
		</td>
	);
};

type BranchRow = FinancialReport["store_breakdown"][number];

interface BranchListProps {
	rows: BranchRow[];
	max: number;
}

const BranchList = ({ rows, max }: BranchListProps) => {
	if (rows.length === 0) {
		return null;
	}
	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid gap-4 p-4">
				<SectionTitle title="Store leaderboard" />
				<div className="grid grid-cols-1 gap-3">
					{rows.map((row) => {
						const widthPct = max === 0 ? 0 : (row.revenue / max) * 100;
						const aov = safeRatio(row.revenue, row.orders);
						return (
							<div className="grid gap-1" key={row.store_id}>
								<div className="flex items-center justify-between gap-2">
									<span className="flex min-w-0 items-center gap-2 truncate text-body font-medium">
										<span className="font-normal text-subhead tabular-nums">
											{row.store_code}
										</span>
										<span className="truncate">{row.store_name}</span>
									</span>
									<span className="text-body tabular-nums">
										{compactMoney(row.revenue)}
									</span>
								</div>
								<div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-bar-track">
									<div
										className="h-full rounded-full bg-primary"
										style={{ width: `${widthPct}%` }}
									/>
								</div>
								<div className="flex flex-wrap items-center gap-x-3 text-subhead tabular-nums">
									<span>{`${row.orders.toLocaleString("id-ID")} orders`}</span>
									<span aria-hidden className="text-muted-foreground">
										·
									</span>
									<span>{`AOV ${compactMoney(aov)}`}</span>
									<span aria-hidden className="text-muted-foreground">
										·
									</span>
									<span>{`${percentFormatter.format(row.share)} share`}</span>
								</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
};

export default FinancialPanel;
