import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerLink } from "@/features/customers/components/customer-link";
import { type ReportGranularity, reportsQueries } from "@/features/reports/api";
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
import { staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

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
	const query = useQuery({
		...reportsQueries.customerAcquisition({
			from,
			to,
			store_id: storeId,
			granularity,
		}),
		placeholderData: keepPreviousData,
	});
	const data = query.data;
	const summary = data?.summary.current;
	const deltas = data?.summary.deltas;

	const topCustomers = data?.top_customers ?? [];
	const maxTopCollected = topCustomers.reduce(
		(m, c) => Math.max(m, c.collected),
		0,
	);

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = ["Customers,Period,New,Cumulative"];
		for (const row of data.series) {
			lines.push(
				`Customers,${escapeCsv(row.bucket)},${row.new_customers},${row.cumulative}`,
			);
		}
		lines.push("");
		lines.push(
			"Customer orders,Period,New-customer orders,Returning-customer orders",
		);
		for (const row of data.mix_series) {
			lines.push(
				`Orders,${escapeCsv(row.bucket)},${row.new_customer_orders},${row.returning_customer_orders}`,
			);
		}
		lines.push("");
		lines.push("Top customers,Customer ID,Name,Phone,Orders,Collected");
		for (const c of topCustomers) {
			lines.push(
				`Top customers,${c.customer_id},${escapeCsv(c.customer_name)},${escapeCsv(c.customer_phone)},${c.orders},${c.collected}`,
			);
		}
		downloadCsv(
			csvFilename("customer-acquisition", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	const cumulativeEnd = summary?.cumulative_end ?? 0;

	return (
		<div className={cn("grid gap-6", staleFade(query.isPlaceholderData))}>
			<ExportButton disabled={!data} onClick={handleExport} />
			<KpiRow isPending={!data}>
				<KpiCard
					label="New customers"
					value={numberFormatter.format(summary?.new_customers ?? 0)}
					delta={deltas?.new_customers ?? null}
					helper="Registered in range"
				/>
				<KpiCard
					label="Cumulative total"
					value={numberFormatter.format(cumulativeEnd)}
					delta={deltas?.cumulative_end ?? null}
					helper="All-time, end of range"
				/>
				<KpiCard
					label="Active customers"
					value={numberFormatter.format(
						summary?.active_customers_in_range ?? 0,
					)}
					delta={deltas?.active_customers_in_range ?? null}
					helper="Placed ≥1 order"
				/>
				<KpiCard
					label="Repeat rate"
					value={percentFormatter.format(summary?.repeat_rate ?? 0)}
					delta={deltas?.repeat_rate ?? null}
					helper="Active with >1 order"
				/>
			</KpiRow>

			<ChartCard
				variant="area"
				title="New customers over time"
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
					<CardTitle>Top spenders</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{topCustomers.length === 0 ? (
						<p className="text-body text-muted-foreground">
							No paid orders in range.
						</p>
					) : (
						<div className="grid grid-cols-1 gap-3">
							{topCustomers.map((c, idx) => {
								const pct =
									maxTopCollected === 0
										? 0
										: (c.collected / maxTopCollected) * 100;
								return (
									<div key={c.customer_id} className="grid gap-1">
										<div className="flex items-center justify-between gap-2">
											<span className="flex items-center gap-2 truncate text-body font-medium">
												<span className="text-subhead font-medium text-muted-foreground tabular-nums">
													{`#${idx + 1}`}
												</span>
												<CustomerLink
													className="truncate"
													customerId={c.customer_id}
													name={c.customer_name}
												/>
											</span>
											<span className="text-body tabular-nums">
												{formatMoney(String(c.collected))}
											</span>
										</div>
										<div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-bar-track">
											<div
												className="h-full rounded-full bg-primary"
												style={{ width: `${pct}%` }}
											/>
										</div>
										<div className="flex flex-wrap items-center justify-between gap-x-3 text-subhead tabular-nums">
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
