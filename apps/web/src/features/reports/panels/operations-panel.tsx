import { useQuery } from "@tanstack/react-query";
import { ChartCard } from "@/features/reports/components/chart-card";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import { numberFormatter } from "@/features/reports/utils/format";
import { CHART_PALETTE } from "@/features/reports/utils/palette";
import type { ReportGranularity } from "@/lib/api";
import { ordersFlowQueryOptions } from "@/lib/query-options";

interface OperationsPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

export const OperationsPanel = ({
	from,
	to,
	storeId,
	granularity,
}: OperationsPanelProps) => {
	const query = useQuery(
		ordersFlowQueryOptions({ from, to, store_id: storeId, granularity }),
	);
	const data = query.data;
	const summary = data?.summary.current;
	const deltas = data?.summary.deltas;

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = ["Orders flow,Bucket,Orders in,Orders out"];
		for (const row of data.series) {
			lines.push(
				`Orders flow,${escapeCsv(row.bucket)},${row.orders_in},${row.orders_out}`,
			);
		}
		lines.push("");
		lines.push("Totals,Metric,Current,Previous");
		const prev = data.summary.previous;
		lines.push(
			`Totals,Orders in,${summary?.orders_in_total ?? 0},${prev.orders_in_total}`,
		);
		lines.push(
			`Totals,Orders out,${summary?.orders_out_total ?? 0},${prev.orders_out_total}`,
		);
		lines.push(`Totals,Net flow,${summary?.net_flow ?? 0},${prev.net_flow}`);
		lines.push(
			`Totals,Distinct handlers,${summary?.distinct_handlers ?? 0},${prev.distinct_handlers}`,
		);
		lines.push(
			`Totals,Throughput/handler,${summary?.throughput_per_handler ?? 0},${prev.throughput_per_handler}`,
		);
		downloadCsv(
			csvFilename("orders-flow", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Orders in"
						value={numberFormatter.format(summary?.orders_in_total ?? 0)}
						delta={deltas?.orders_in_total}
						helper="Dropped off in range"
					/>
					<KpiCard
						label="Orders out"
						value={numberFormatter.format(summary?.orders_out_total ?? 0)}
						delta={deltas?.orders_out_total}
						helper="Picked up in range"
					/>
					<KpiCard
						label="Throughput / handler"
						value={(summary?.throughput_per_handler ?? 0).toFixed(2)}
						delta={deltas?.throughput_per_handler}
						helper={`${summary?.distinct_handlers ?? 0} handlers in range`}
					/>
					<KpiCard
						label="Net flow"
						value={numberFormatter.format(summary?.net_flow ?? 0)}
						delta={deltas?.net_flow}
						helper="Positive = backlog growing"
					/>
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<ChartCard
				variant="stacked-bar"
				title="Order dropoff vs pickup"
				description="Throughput over the selected range."
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				series={[
					{ key: "orders_in", label: "Orders in", color: CHART_PALETTE[0] },
					{ key: "orders_out", label: "Orders out", color: CHART_PALETTE[1] },
				]}
				valueFormatter={(v) => numberFormatter.format(v)}
			/>
		</div>
	);
};

export default OperationsPanel;
