import { Wallet01Icon } from "@hugeicons/core-free-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ReportGranularity, reportsQueries } from "@/features/reports/api";
import { ChartCard } from "@/features/reports/components/chart-card";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { rangeAxis, sumHead } from "@/features/reports/components/report-chart";
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
	rangeLabel,
} from "@/features/reports/utils/format";
import {
	CHART_OTHER_COLOR,
	topFourColor,
} from "@/features/reports/utils/palette";
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

	// Methods arrive biggest first, so the top four get colours and the rest
	// share one grey Other.
	const rows = data?.series ?? [];
	const methods = data?.method_keys ?? [];
	const amount = (row: (typeof rows)[number], key: string) =>
		Number(row[key] ?? 0);
	const series = methods.slice(0, 4).map((m, idx) => ({
		key: m.key,
		name: m.label,
		color: topFourColor(idx),
		values: rows.map((row) => amount(row, m.key)),
	}));
	if (methods.length > 4) {
		series.push({
			key: "other",
			name: "Other",
			color: CHART_OTHER_COLOR,
			values: rows.map((row) =>
				methods.slice(4).reduce((sum, m) => sum + amount(row, m.key), 0),
			),
		});
	}
	const labels = rows.map((row) => String(row.bucket));
	const axis = rangeAxis(data?.granularity ?? "day");

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
				title="Collected by Payment Method"
				labels={labels}
				axis={axis}
				groups={[series]}
				formatAxis={compactNumber}
				head={sumHead({
					name: "Collected",
					caption: rangeLabel(from, to),
					labels,
					axis,
					series,
					format: compactMoney,
				})}
			/>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle>Mix Share</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{(data?.summary.methods ?? []).length === 0 ? (
						<EmptyState icon={Wallet01Icon}>No paid orders</EmptyState>
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
