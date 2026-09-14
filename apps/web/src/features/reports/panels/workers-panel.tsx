import { WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ReportGranularity,
	reportsQueries,
	type WorkerProductivityReport,
} from "@/features/reports/api";
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

interface WorkersPanelProps {
	from: string;
	to: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

type Worker = WorkerProductivityReport["workers"][number];

export const WorkersPanel = ({
	from,
	to,
	storeId,
	granularity,
}: WorkersPanelProps) => {
	const query = useQuery(
		reportsQueries.workerProductivity({
			from,
			to,
			store_id: storeId,
			granularity,
		}),
	);
	const data = query.data;
	const summary = data?.summary.current;
	const deltas = data?.summary.deltas;
	const workers: Worker[] = data?.workers ?? [];
	const maxServices = workers.reduce(
		(m, w) => Math.max(m, w.services_processed),
		0,
	);

	const topWorkers = workers.slice(0, 6);
	const maxOf = (pick: (w: Worker) => number) =>
		topWorkers.reduce((m, w) => Math.max(m, pick(w)), 0);
	const maxRefund = maxOf((w) => w.refund_items);
	const maxRework = maxOf((w) => w.rework_items);
	const maxSph = maxOf((w) => w.services_per_hour);
	const norm = (val: number, max: number) =>
		max === 0 ? 0 : Math.round((val / max) * 100);

	const radarData = topWorkers.map((w) => ({
		worker: w.user_name,
		services: norm(w.services_processed, maxServices),
		rework: maxRework === 0 ? 0 : 100 - norm(w.rework_items, maxRework),
		refunds: maxRefund === 0 ? 0 : 100 - norm(w.refund_items, maxRefund),
		speed: norm(w.services_per_hour, maxSph),
	}));

	const handleExport = () => {
		if (!data) {
			return;
		}
		const lines: string[] = [
			"Worker productivity,User ID,Name,Services processed,Refund items,Rework items,Rework rate,Shift minutes,Services per hour",
		];
		for (const w of workers) {
			lines.push(
				`Worker productivity,${w.user_id},${escapeCsv(w.user_name)},${w.services_processed},${w.refund_items},${w.rework_items},${w.rework_rate},${w.shift_minutes},${w.services_per_hour}`,
			);
		}
		downloadCsv(
			csvFilename("worker-productivity", data.from, data.to, data.store_id),
			lines.join("\n"),
		);
	};

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Workers"
						value={numberFormatter.format(summary?.worker_count ?? 0)}
						delta={deltas?.worker_count}
						helper="Users with role worker"
					/>
					<KpiCard
						label="Services processed"
						value={numberFormatter.format(
							summary?.total_services_processed ?? 0,
						)}
						delta={deltas?.total_services_processed}
						helper="First reached QC"
					/>
					<KpiCard
						label="Rework rate"
						value={percentFormatter.format(summary?.rework_rate ?? 0)}
						delta={deltas?.rework_rate}
						helper={`${numberFormatter.format(summary?.total_rework_items ?? 0)} services with QC kickback`}
					/>
					<KpiCard
						label="Avg services/hour"
						value={(summary?.avg_services_per_hour ?? 0).toFixed(2)}
						delta={deltas?.avg_services_per_hour}
					/>
				</KpiRow>
				<ExportButton disabled={!data} onClick={handleExport} />
			</div>

			<ChartCard
				variant="radar"
				title="Worker profile · top 6"
				description="Scored against the top performer. Refunds and rework count against."
				data={radarData}
				categoryKey="worker"
				series={[
					{ key: "services", label: "Services", color: CHART_PALETTE[0] },
					{ key: "speed", label: "Speed", color: CHART_PALETTE[1] },
					{ key: "rework", label: "Quality", color: CHART_PALETTE[2] },
					{ key: "refunds", label: "Refund-free", color: CHART_PALETTE[4] },
				]}
				valueFormatter={(v) => `${v}`}
			/>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Worker leaderboard
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					{workers.length === 0 ? (
						<p className="text-sm text-muted-foreground">No worker activity</p>
					) : (
						<div className="grid gap-3">
							{workers.map((w) => {
								const pct =
									maxServices === 0
										? 0
										: (w.services_processed / maxServices) * 100;
								const hours = w.shift_minutes / 60;
								return (
									<div key={w.user_id} className="grid gap-1">
										<div className="flex items-center justify-between gap-2">
											<span className="flex items-center gap-1.5 truncate text-sm font-medium">
												{w.rework_items > 0 ? (
													<WarningIcon
														className="size-3 text-destructive"
														weight="fill"
													/>
												) : null}
												{w.user_name}
											</span>
											<span className="font-mono text-sm tabular-nums">
												{`${numberFormatter.format(w.services_processed)} services`}
											</span>
										</div>
										<div className="h-1.5 w-full bg-muted">
											<div
												className="h-full bg-foreground"
												style={{ width: `${pct}%` }}
											/>
										</div>
										<div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
											<span>{`${hours.toFixed(1)}h worked`}</span>
											<span>{`${w.services_per_hour} services/hr`}</span>
											<span>{`${w.rework_items} rework`}</span>
											<span>{`${w.refund_items} refunded`}</span>
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

export default WorkersPanel;
