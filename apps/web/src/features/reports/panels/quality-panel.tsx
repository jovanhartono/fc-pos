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
import { refundTrendQueryOptions } from "@/lib/query-options";
import { formatIDRCurrency } from "@/shared/utils";

interface QualityPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

const REASON_LABELS: Record<string, string> = {
	damaged: "Damaged",
	cannot_process: "Cannot process",
	lost: "Lost",
	other: "Other",
};

const REASON_ORDER = ["damaged", "cannot_process", "lost", "other"] as const;

export const QualityPanel = ({
	from,
	to,
	storeId,
	granularity,
}: QualityPanelProps) => {
	const query = useQuery(
		refundTrendQueryOptions({ from, to, store_id: storeId, granularity }),
	);
	const data = query.data;
	const reasonTotals = data?.summary.reason_totals;
	const totalAmount = data?.summary.total_amount ?? 0;

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = ["Refund trend,Bucket,Amount,Refunds"];
		for (const row of data.series) {
			lines.push(
				`Refund trend,${escapeCsv(row.bucket)},${row.amount},${row.refunds}`,
			);
		}
		lines.push("");
		lines.push("Refund reasons,Reason,Amount,Items");
		for (const reason of REASON_ORDER) {
			const totals = reasonTotals?.[reason];
			if (totals) {
				lines.push(
					`Refund reasons,${escapeCsv(REASON_LABELS[reason] ?? reason)},${totals.amount},${totals.items}`,
				);
			}
		}
		downloadCsv(
			csvFilename("refund-trend", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Refund amount"
						value={formatIDRCurrency(String(totalAmount))}
					/>
					<KpiCard
						label="Refund events"
						value={numberFormatter.format(data?.summary.total_refunds ?? 0)}
					/>
					<KpiCard
						label="Damaged items"
						value={numberFormatter.format(reasonTotals?.damaged.items ?? 0)}
					/>
					<KpiCard
						label="Lost items"
						value={numberFormatter.format(reasonTotals?.lost.items ?? 0)}
					/>
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<ChartCard
				variant="area"
				title="Refund amount trend"
				description="Total refunded value over the range."
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				series={[
					{ key: "amount", label: "Refund amount", color: CHART_PALETTE[3] },
				]}
				valueFormatter={(v) => formatIDRCurrency(String(v))}
			/>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Reason breakdown
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{reasonTotals ? (
						<div className="grid gap-3">
							{REASON_ORDER.map((reason) => {
								const totals = reasonTotals[reason];
								const share = totalAmount > 0 ? totals.amount / totalAmount : 0;
								return (
									<div key={reason} className="grid gap-1">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate text-sm font-medium">
												{REASON_LABELS[reason]}
											</span>
											<span className="font-mono text-sm tabular-nums">
												{formatIDRCurrency(String(totals.amount))}
											</span>
										</div>
										<div className="h-1.5 w-full bg-muted">
											<div
												className="h-full bg-foreground"
												style={{ width: `${share * 100}%` }}
											/>
										</div>
										<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
											<span>{`${numberFormatter.format(totals.items)} items`}</span>
											<span>{percentFormatter.format(share)}</span>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No refunds in range.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
};

export default QualityPanel;
