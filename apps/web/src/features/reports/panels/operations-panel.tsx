import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReportGranularity, reportsQueries } from "@/features/reports/api";
import { ChartCard } from "@/features/reports/components/chart-card";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { TurnaroundSection } from "@/features/reports/components/turnaround-section";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import { numberFormatter } from "@/features/reports/utils/format";
import {
	ORDERS_IN_COLOR,
	ORDERS_OUT_COLOR,
} from "@/features/reports/utils/palette";
import { longDuration } from "@/features/reports/utils/turnaround";
import { staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";

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
	const query = useQuery({
		...reportsQueries.ordersFlow({ from, to, store_id: storeId, granularity }),
		placeholderData: keepPreviousData,
	});
	const turnaroundQuery = useQuery({
		...reportsQueries.turnaround({ from, to, store_id: storeId, granularity }),
		placeholderData: keepPreviousData,
	});
	const turnaround = turnaroundQuery.data;
	const data = query.data;
	const summary = data?.summary.current;
	const deltas = data?.summary.deltas;
	const readyWithin = turnaround?.rows[0]?.p75 ?? null;

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = ["Orders flow,Period,Orders in,Orders out"];
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
		downloadCsv(
			csvFilename("orders-flow", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div
			className={cn(
				"grid gap-6",
				staleFade(query.isPlaceholderData || turnaroundQuery.isPlaceholderData),
			)}
		>
			<ExportButton disabled={!data} onClick={handleExport} />
			<KpiRow isPending={!data}>
				<KpiCard
					label="Orders in"
					swatch={ORDERS_IN_COLOR}
					value={numberFormatter.format(summary?.orders_in_total ?? 0)}
					delta={deltas?.orders_in_total ?? null}
					helper="Dropped off in range"
				/>
				<KpiCard
					label="Orders out"
					swatch={ORDERS_OUT_COLOR}
					value={numberFormatter.format(summary?.orders_out_total ?? 0)}
					delta={deltas?.orders_out_total ?? null}
					helper="Picked up in range"
				/>
				<KpiCard
					label="Net flow"
					value={numberFormatter.format(summary?.net_flow ?? 0)}
					delta={deltas?.net_flow ?? null}
					helper="Positive = backlog growing"
				/>
				<KpiCard
					label="Ready within"
					value={readyWithin === null ? "–" : longDuration(readyWithin)}
					helper="p75, drop-off to ready"
				/>
			</KpiRow>

			<ChartCard
				variant="bar"
				hideLegend
				title="Order dropoff vs pickup"
				data={data?.series ?? []}
				granularity={data?.granularity ?? "day"}
				series={[
					{ key: "orders_in", label: "Orders in", color: ORDERS_IN_COLOR },
					{ key: "orders_out", label: "Orders out", color: ORDERS_OUT_COLOR },
				]}
				valueFormatter={(v) => numberFormatter.format(v)}
			/>

			{turnaround !== undefined && <TurnaroundSection report={turnaround} />}
			{turnaroundQuery.status === "error" && (
				<p className="text-muted-foreground text-body">
					Could not load Turnaround.
				</p>
			)}
		</div>
	);
};

export default OperationsPanel;
