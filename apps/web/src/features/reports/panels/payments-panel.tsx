import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	compactMoney,
	numberFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import { topFourColor } from "@/features/reports/utils/palette";
import { staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface PaymentsPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

export const PaymentsPanel = ({
	from,
	to,
	storeId,
	granularity,
}: PaymentsPanelProps) => {
	const query = useQuery({
		...reportsQueries.paymentMix({ from, to, store_id: storeId, granularity }),
		placeholderData: keepPreviousData,
	});
	const data = query.data;

	// Methods arrive biggest first, in the same order as the Mix share list, so
	// the list doubles as the chart's key.
	const series = (data?.method_keys ?? []).map((m, idx) => ({
		key: m.key,
		label: m.label,
		color: topFourColor(idx),
	}));

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = [];
		lines.push(
			`Payment mix,Period,${data.method_keys.map((m) => escapeCsv(m.label)).join(",")}`,
		);
		for (const row of data.series) {
			lines.push(
				`Payment mix,${escapeCsv(row.bucket as string)},${data.method_keys.map((m) => row[m.key] ?? 0).join(",")}`,
			);
		}
		lines.push("");
		lines.push("Totals,Method,Collected,Orders,Share");
		for (const m of data.summary.methods) {
			lines.push(
				`Totals,${escapeCsv(m.payment_method_name)},${m.collected},${m.orders},${m.share}`,
			);
		}
		downloadCsv(
			csvFilename("payment-mix", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className={cn("grid gap-6", staleFade(query.isPlaceholderData))}>
			<ExportButton disabled={!data} onClick={handleExport} />
			<KpiRow isPending={!data}>
				<KpiCard
					label="Collected"
					value={formatMoney(String(data?.summary.grand_total ?? 0))}
				/>
				<KpiCard
					label="Paid orders"
					value={numberFormatter.format(data?.summary.total_orders ?? 0)}
				/>
				<KpiCard label="Methods" value={data?.summary.methods.length ?? 0} />
			</KpiRow>

			<ChartCard
				variant="stacked-bar"
				title="Collected by payment method"
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				series={series}
				valueFormatter={(v) => formatMoney(String(v))}
				axisFormatter={compactMoney}
				hideLegend
			/>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle>Mix share</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{(data?.summary.methods ?? []).length === 0 ? (
						<p className="text-body text-muted-foreground">No paid orders</p>
					) : (
						<div className="grid grid-cols-1 gap-3">
							{data?.summary.methods.map((m, idx) => (
								<div key={m.payment_method_id} className="grid gap-1">
									<div className="flex items-center justify-between gap-2">
										<span className="flex min-w-0 items-center gap-2 text-body font-medium">
											<span
												aria-hidden="true"
												className="size-2 shrink-0 rounded-full"
												style={{ backgroundColor: topFourColor(idx) }}
											/>
											<span className="truncate">{m.payment_method_name}</span>
										</span>
										<span className="text-body tabular-nums">
											{formatMoney(String(m.collected))}
										</span>
									</div>
									<div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-bar-track">
										{/* The chart's grey would vanish into the grey track. */}
										<div
											className={cn(
												"h-full rounded-full",
												idx >= 4 && "opacity-50",
											)}
											style={{
												width: `${m.share * 100}%`,
												backgroundColor:
													idx < 4
														? topFourColor(idx)
														: "var(--muted-foreground)",
											}}
										/>
									</div>
									<div className="flex flex-wrap items-center justify-between gap-x-3 text-subhead tabular-nums">
										<span>{`${m.orders} orders`}</span>
										<span>{percentFormatter.format(m.share)}</span>
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};
