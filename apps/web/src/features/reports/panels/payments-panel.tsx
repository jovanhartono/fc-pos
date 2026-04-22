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
import { paymentMixQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

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
	const query = useQuery(
		paymentMixQueryOptions({ from, to, store_id: storeId, granularity }),
	);
	const data = query.data;

	const series = (data?.method_keys ?? []).map((m, idx) => ({
		key: m.key,
		label: m.label,
		color: CHART_PALETTE[idx % CHART_PALETTE.length],
	}));

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = [];
		lines.push(
			`Payment mix,Bucket,${data.method_keys.map((m) => escapeCsv(m.label)).join(",")}`,
		);
		for (const row of data.series) {
			lines.push(
				`Payment mix,${escapeCsv(row.bucket as string)},${data.method_keys.map((m) => row[m.key] ?? 0).join(",")}`,
			);
		}
		lines.push("");
		lines.push("Totals,Method,Revenue,Orders,Share");
		for (const m of data.summary.methods) {
			lines.push(
				`Totals,${escapeCsv(m.payment_method_name)},${m.revenue},${m.orders},${m.share}`,
			);
		}
		downloadCsv(
			csvFilename("payment-mix", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Paid revenue"
						value={formatIDRCurrency(String(data?.summary.grand_total ?? 0))}
					/>
					<KpiCard
						label="Paid orders"
						value={numberFormatter.format(data?.summary.total_orders ?? 0)}
					/>
					<KpiCard label="Methods" value={data?.summary.methods.length ?? 0} />
					<KpiCard label="Granularity" value={data?.granularity ?? "—"} />
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<ChartCard
				variant="stacked-bar"
				title="Revenue by payment method"
				description="Stacked bars over time."
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				series={series}
				valueFormatter={(v) => formatIDRCurrency(String(v))}
			/>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Mix share
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{(data?.summary.methods ?? []).length === 0 ? (
						<p className="text-sm text-muted-foreground">No paid orders.</p>
					) : (
						<div className="grid gap-3">
							{data?.summary.methods.map((m) => (
								<div key={m.payment_method_id} className="grid gap-1">
									<div className="flex items-center justify-between gap-2">
										<span className="truncate text-sm font-medium">
											{m.payment_method_name}
										</span>
										<span className="font-mono text-sm tabular-nums">
											{formatIDRCurrency(String(m.revenue))}
										</span>
									</div>
									<div className="h-1.5 w-full bg-muted">
										<div
											className="h-full bg-foreground"
											style={{ width: `${m.share * 100}%` }}
										/>
									</div>
									<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
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

export default PaymentsPanel;
