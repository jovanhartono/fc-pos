import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ReportGranularity } from "@/lib/api";
import { customerAcquisitionQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

interface CustomersPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

export const CustomersPanel = ({
	from,
	to,
	storeId,
	granularity,
}: CustomersPanelProps) => {
	const query = useQuery(
		customerAcquisitionQueryOptions({
			from,
			to,
			store_id: storeId,
			granularity,
		}),
	);
	const data = query.data;
	const summary = data?.summary.current;
	const deltas = data?.summary.deltas;

	const topCustomers = data?.top_customers ?? [];
	const maxTopRevenue = topCustomers.reduce(
		(m, c) => Math.max(m, c.revenue),
		0,
	);

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = ["Customers,Bucket,New,Cumulative"];
		for (const row of data.series) {
			lines.push(
				`Customers,${escapeCsv(row.bucket)},${row.new_customers},${row.cumulative}`,
			);
		}
		lines.push("");
		lines.push(
			"Customer orders,Bucket,New-customer orders,Returning-customer orders",
		);
		for (const row of data.mix_series) {
			lines.push(
				`Orders,${escapeCsv(row.bucket)},${row.new_customer_orders},${row.returning_customer_orders}`,
			);
		}
		lines.push("");
		lines.push("Top customers,Customer ID,Name,Phone,Orders,Revenue");
		for (const c of topCustomers) {
			lines.push(
				`Top customers,${c.customer_id},${escapeCsv(c.customer_name)},${escapeCsv(c.customer_phone)},${c.orders},${c.revenue}`,
			);
		}
		downloadCsv(
			csvFilename("customer-acquisition", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	const cumulativeEnd = summary?.cumulative_end ?? 0;

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="New customers"
						value={numberFormatter.format(summary?.new_customers ?? 0)}
						delta={deltas?.new_customers}
						helper="Registered in range"
					/>
					<KpiCard
						label="Cumulative total"
						value={numberFormatter.format(cumulativeEnd)}
						delta={deltas?.cumulative_end}
						helper="All-time, end of range"
					/>
					<KpiCard
						label="Active customers"
						value={numberFormatter.format(
							summary?.active_customers_in_range ?? 0,
						)}
						delta={deltas?.active_customers_in_range}
						helper="Placed ≥1 order"
					/>
					<KpiCard
						label="Repeat rate"
						value={percentFormatter.format(summary?.repeat_rate ?? 0)}
						delta={deltas?.repeat_rate}
						helper="Active with >1 order"
					/>
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<ChartCard
				variant="area"
				title="New customers per bucket"
				description="Fresh sign-ups over the range."
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				series={[
					{
						key: "new_customers",
						label: "New customers",
						color: CHART_PALETTE[0],
					},
				]}
				valueFormatter={(v) => numberFormatter.format(v)}
			/>

			<ChartCard
				variant="stacked-bar"
				title="Orders · new vs returning customers"
				description="Split per bucket."
				data={data?.mix_series ?? []}
				granularity={data?.granularity ?? "day"}
				series={[
					{
						key: "new_customer_orders",
						label: "New",
						color: CHART_PALETTE[1],
					},
					{
						key: "returning_customer_orders",
						label: "Returning",
						color: CHART_PALETTE[0],
					},
				]}
				valueFormatter={(v) => numberFormatter.format(v)}
			/>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Top spenders
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{topCustomers.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No paid orders in range.
						</p>
					) : (
						<div className="grid gap-3">
							{topCustomers.map((c, idx) => {
								const pct =
									maxTopRevenue === 0 ? 0 : (c.revenue / maxTopRevenue) * 100;
								return (
									<div key={c.customer_id} className="grid gap-1">
										<div className="flex items-center justify-between gap-2">
											<span className="flex items-center gap-2 truncate text-sm font-medium">
												<span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
													{`#${idx + 1}`}
												</span>
												<span className="truncate">{c.customer_name}</span>
											</span>
											<span className="font-mono text-sm tabular-nums">
												{formatIDRCurrency(String(c.revenue))}
											</span>
										</div>
										<div className="h-1.5 w-full bg-muted">
											<div
												className="h-full bg-foreground"
												style={{ width: `${pct}%` }}
											/>
										</div>
										<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
											<span>{c.customer_phone}</span>
											<span>{`${numberFormatter.format(c.orders)} orders`}</span>
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

export default CustomersPanel;
