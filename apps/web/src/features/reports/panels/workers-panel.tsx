import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
	reportsQueries,
	type WorkerProductivityReport,
	type WorkerRow,
} from "@/features/reports/api";
import { AllStoresButton } from "@/features/reports/components/all-stores-button";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	ReportSection,
	ReportSkeleton,
} from "@/features/reports/components/report-section";
import { ServicesByWorker } from "@/features/reports/components/services-by-worker";
import { useOpenWorkerSheet } from "@/features/reports/components/worker-sheet";
import {
	RangeWorkersTable,
	TodayWorkersTable,
} from "@/features/reports/components/workers-table";
import { csvFilename, downloadCsv } from "@/features/reports/utils/csv";
import {
	numberFormatter,
	oneDecimalFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import { buildWorkersCsv } from "@/features/reports/utils/workers-report";

interface WorkersPanelProps {
	from: string;
	to: string;
	storeId?: number;
	// Undefined is All stores.
	onStoreChange: (storeId: number | undefined) => void;
}

const perDayWorkedHelper = (
	summary: WorkerProductivityReport["summary"]["current"],
) => {
	if (summary.days_worked === 0) {
		return "No days worked in range";
	}
	if (summary.daily_p25 === null || summary.daily_p75 === null) {
		return "per person per day";
	}
	return `most days ${Math.round(summary.daily_p25)}–${Math.round(summary.daily_p75)}`;
};

export const WorkersPanel = ({
	from,
	to,
	storeId,
	onStoreChange,
}: WorkersPanelProps) => {
	const query = useQuery(
		reportsQueries.workerProductivity({ from, to, store_id: storeId }),
	);
	const openWorkerSheet = useOpenWorkerSheet();
	const data = query.data;

	if (query.isPending) {
		return <ReportSkeleton />;
	}
	if (!data) {
		return (
			<div className="flex items-center gap-3 text-muted-foreground text-sm">
				Couldn't load the Workers report.
				<Button variant="outline" size="sm" onClick={() => query.refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	const { current, deltas } = data.summary;
	const isAllStores = storeId === undefined;
	const hasDaysWorked = current.days_worked > 0;
	// Part of today against all of yesterday would read as a drop every morning.
	const shownDeltas = data.is_today ? null : deltas;
	const handleExport = () =>
		downloadCsv(
			csvFilename("worker-productivity", data.from, data.to, data.store_id),
			buildWorkersCsv(data),
		);
	// A new range opens its own busiest Store.
	const tableKey = `${data.from}:${data.to}:${data.workers.length > 0}`;
	const allStoresLink = isAllStores ? null : (
		<AllStoresButton onClick={() => onStoreChange(undefined)} />
	);
	const handleOpen = (row: WorkerRow) =>
		openWorkerSheet({
			from: data.from,
			to: data.to,
			storeId: row.store_id,
			storeName: row.store_name,
			userId: row.user_id,
			userName: row.user_name,
			role: row.role,
		});

	return (
		<div className="grid gap-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="Services processed"
						value={numberFormatter.format(current.services_processed)}
						delta={shownDeltas?.services_processed ?? null}
						helper="First reached QC"
					/>
					<KpiCard
						label="Per day worked"
						value={
							hasDaysWorked
								? oneDecimalFormatter.format(current.per_day_worked)
								: "—"
						}
						delta={hasDaysWorked ? (shownDeltas?.per_day_worked ?? null) : null}
						helper={perDayWorkedHelper(current)}
					/>
					<KpiCard
						label="QC reject rate"
						value={percentFormatter.format(current.qc_reject_rate)}
						delta={shownDeltas?.qc_reject_rate ?? null}
						deltaAs="points"
						isLowerBetter
						helper={`${numberFormatter.format(current.qc_rejects)} of ${numberFormatter.format(current.qc_checks)} ${current.qc_checks === 1 ? "check" : "checks"} sent back`}
					/>
					<KpiCard
						label="Complaint rate"
						value={percentFormatter.format(current.complaint_rate)}
						delta={shownDeltas?.complaint_rate ?? null}
						deltaAs="points"
						isLowerBetter
						helper={`${numberFormatter.format(current.complaints)} of ${numberFormatter.format(current.complaint_cohort)} finished came back`}
					/>
				</KpiRow>
				<ExportButton onClick={handleExport} />
			</div>

			<ReportSection id="workers-rows" title="Workers" aside={allStoresLink}>
				{data.is_today ? (
					<TodayWorkersTable
						key={tableKey}
						workers={data.workers}
						isAllStores={isAllStores}
						onOpen={handleOpen}
					/>
				) : (
					<RangeWorkersTable
						key={tableKey}
						workers={data.workers}
						isAllStores={isAllStores}
						onOpen={handleOpen}
					/>
				)}
			</ReportSection>

			<ReportSection
				id="workers-services"
				title="Services by worker"
				aside={allStoresLink}
			>
				<ServicesByWorker
					data={data}
					isAllStores={isAllStores}
					onStoreChange={onStoreChange}
				/>
			</ReportSection>
		</div>
	);
};

export default WorkersPanel;
