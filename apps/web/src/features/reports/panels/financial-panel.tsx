import { useQuery } from "@tanstack/react-query";
import { ChartCard } from "@/features/reports/components/chart-card";
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
import { CHART_PALETTE } from "@/features/reports/utils/palette";
import type { FinancialReport, ReportGranularity } from "@/lib/api";
import { financialQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

interface FinancialPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

const OTHER_COLOR = "var(--muted-foreground)";
const CATEGORY_PALETTE = CHART_PALETTE.slice(0, 5);

export const FinancialPanel = ({
	from,
	to,
	storeId,
	granularity,
}: FinancialPanelProps) => {
	const query = useQuery(
		financialQueryOptions({ from, to, store_id: storeId, granularity }),
	);
	const data = query.data;
	const summary = data?.summary.current;
	const deltas = data?.summary.deltas;

	const categoryKeys = data?.category_keys ?? [];
	const categorySeries = categoryKeys.map((c, idx) => ({
		key: c.key,
		label: c.label,
		color:
			c.key === "cat_other"
				? OTHER_COLOR
				: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
	}));

	const storeBreakdown = data?.store_breakdown ?? [];
	const storeMax = storeBreakdown.reduce((m, r) => Math.max(m, r.revenue), 0);

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = [];
		const prev = data.summary.previous;
		lines.push("Financial totals,Metric,Current,Previous");
		lines.push(
			`Totals,Gross revenue,${summary?.gross_revenue ?? 0},${prev.gross_revenue}`,
		);
		lines.push(
			`Totals,Services,${summary?.services_total ?? 0},${prev.services_total}`,
		);
		lines.push(
			`Totals,Products,${summary?.products_total ?? 0},${prev.products_total}`,
		);
		lines.push(`Totals,COGS,${summary?.cogs ?? 0},${prev.cogs}`);
		lines.push(
			`Totals,Gross profit,${summary?.gross_profit ?? 0},${prev.gross_profit}`,
		);
		lines.push(`Totals,Refunds,${summary?.refunds ?? 0},${prev.refunds}`);
		lines.push(
			`Totals,Net income,${summary?.net_income ?? 0},${prev.net_income}`,
		);
		lines.push(
			`Totals,Net margin,${summary?.net_margin ?? 0},${prev.net_margin}`,
		);
		lines.push("");
		lines.push(
			"Financial series,Bucket,Services,Products,Gross,COGS,Gross profit,Refunds,Net income",
		);
		for (const row of data.series) {
			lines.push(
				`Series,${escapeCsv(row.bucket)},${row.services},${row.products},${row.gross_revenue},${row.cogs},${row.gross_profit},${row.refunds},${row.net_income}`,
			);
		}
		lines.push("");
		lines.push("Branch revenue,Store code,Store name,Revenue,Orders,Share");
		for (const row of storeBreakdown) {
			lines.push(
				`Branch,${escapeCsv(row.store_code)},${escapeCsv(row.store_name)},${row.revenue},${row.orders},${row.share}`,
			);
		}
		downloadCsv(
			csvFilename("financial", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Gross revenue"
						value={formatIDRCurrency(String(summary?.gross_revenue ?? 0))}
						delta={deltas?.gross_revenue}
						helper="Services + products"
					/>
					<KpiCard
						label="COGS"
						value={formatIDRCurrency(String(summary?.cogs ?? 0))}
						delta={deltas?.cogs}
						helper="Product + service cost"
					/>
					<KpiCard
						label="Gross profit"
						value={formatIDRCurrency(String(summary?.gross_profit ?? 0))}
						delta={deltas?.gross_profit}
						helper="Before refunds"
					/>
					<KpiCard
						label="Refunds"
						value={formatIDRCurrency(String(summary?.refunds ?? 0))}
						delta={deltas?.refunds}
					/>
					<KpiCard
						label="Net income"
						value={formatIDRCurrency(String(summary?.net_income ?? 0))}
						delta={deltas?.net_income}
						helper="Gross - COGS - refunds"
					/>
					<KpiCard
						label="Net margin"
						value={percentFormatter.format(summary?.net_margin ?? 0)}
						delta={deltas?.net_margin}
						helper="Net income / gross"
					/>
					<KpiCard
						label="Services"
						value={formatIDRCurrency(String(summary?.services_total ?? 0))}
						delta={deltas?.services_total}
					/>
					<KpiCard
						label="Products"
						value={formatIDRCurrency(String(summary?.products_total ?? 0))}
						delta={deltas?.products_total}
					/>
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<ChartCard
				variant="area"
				title="Revenue · services vs products"
				description="Stacked paid revenue over time."
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				stacked
				series={[
					{ key: "services", label: "Services", color: CHART_PALETTE[0] },
					{ key: "products", label: "Products", color: CHART_PALETTE[1] },
				]}
				valueFormatter={(v) => formatIDRCurrency(String(v))}
			/>

			<ChartCard
				variant="stacked-bar"
				title="Gross revenue composition"
				description="Net income + COGS + refunds = gross revenue per bucket."
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				series={[
					{ key: "net_income", label: "Net income", color: CHART_PALETTE[1] },
					{ key: "cogs", label: "COGS", color: CHART_PALETTE[2] },
					{ key: "refunds", label: "Refunds", color: CHART_PALETTE[3] },
				]}
				valueFormatter={(v) => formatIDRCurrency(String(v))}
			/>

			<ChartCard
				variant="area"
				title="Service revenue by category"
				description="Top 5 categories stacked; remainder grouped as Other."
				data={data?.category_series ?? []}
				granularity={data?.granularity ?? "day"}
				stacked
				series={categorySeries}
				valueFormatter={(v) => formatIDRCurrency(String(v))}
			/>

			<BranchList rows={storeBreakdown} max={storeMax} />
		</div>
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
		<div className="grid gap-3">
			<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
				Branch leaderboard
			</p>
			<div className="grid gap-3">
				{rows.map((row) => {
					const pct = max === 0 ? 0 : (row.revenue / max) * 100;
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
								<span>{`${numberFormatter.format(row.orders)} orders`}</span>
								<span>{percentFormatter.format(row.share)}</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default FinancialPanel;
