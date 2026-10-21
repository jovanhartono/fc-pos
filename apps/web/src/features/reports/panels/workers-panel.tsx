import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Section } from "@/components/section";
import { TextSkeleton } from "@/components/text-skeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { reportsQueries, type WorkerRow } from "@/features/reports/api";
import { AllStoresButton } from "@/features/reports/components/all-stores-button";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { NeedsALook } from "@/features/reports/components/needs-a-look";
import { ServicesByWorker } from "@/features/reports/components/services-by-worker";
import { useOpenWorkerSheet } from "@/features/reports/components/worker-sheet";
import { WorkersTable } from "@/features/reports/components/workers-table";
import { csvFilename, downloadCsv } from "@/features/reports/utils/csv";
import {
	numberFormatter,
	oneDecimalFormatter,
	percentFormatter,
} from "@/features/reports/utils/format";
import {
	buildWorkersCsv,
	outOf,
	withLive,
} from "@/features/reports/utils/workers-report";
import { staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";

interface WorkersPanelProps {
	from: string;
	to: string;
	storeId?: number;
	// Undefined is All stores.
	onStoreChange: (storeId: number | undefined) => void;
}

export const WorkersPanel = ({
	from,
	to,
	storeId,
	onStoreChange,
}: WorkersPanelProps) => {
	const query = useQuery({
		...reportsQueries.workerProductivity({ from, to, store_id: storeId }),
		placeholderData: keepPreviousData,
	});
	const liveQuery = useQuery({
		...reportsQueries.workerLive({ store_id: storeId }),
		placeholderData: keepPreviousData,
	});
	const openWorkerSheet = useOpenWorkerSheet();
	const data = query.data;
	const workers = useMemo(
		() => (data ? withLive(data.workers, liveQuery.data) : []),
		[data, liveQuery.data],
	);
	// A failed live view still shows the range, just with nobody on the floor.
	const isReady = data && !liveQuery.isPending;

	if (!query.isPending && !data) {
		return (
			<div className="flex items-center gap-3 text-muted-foreground text-body">
				Couldn't load the Workers report.
				<Button variant="outline" size="sm" onClick={() => query.refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	const current = data?.summary.current;
	const isAllStores = storeId === undefined;
	const hasDaysWorked = (current?.days_worked ?? 0) > 0;
	// Part of today against all of yesterday would read as a drop every morning.
	const shownDeltas = data?.is_today ? null : data?.summary.deltas;
	const handleExport = () => {
		if (!data) {
			return;
		}
		downloadCsv(
			csvFilename("worker-productivity", data.from, data.to, data.store_id),
			buildWorkersCsv(data),
		);
	};
	const allStoresLink = isAllStores ? null : (
		<AllStoresButton onClick={() => onStoreChange(undefined)} />
	);
	const handleOpen = (row: WorkerRow) => {
		if (!data) {
			return;
		}
		openWorkerSheet({
			from: data.from,
			to: data.to,
			storeId: row.store_id,
			storeName: row.store_name,
			userId: row.user_id,
			userName: row.user_name,
			role: row.role,
		});
	};

	return (
		<div
			className={cn(
				"grid gap-6",
				staleFade(query.isPlaceholderData || liveQuery.isPlaceholderData),
			)}
		>
			<ExportButton disabled={!data} onClick={handleExport} />
			<KpiRow isPending={!data}>
				<KpiCard
					label="Services processed"
					value={numberFormatter.format(current?.services_processed ?? 0)}
					delta={shownDeltas?.services_processed ?? null}
					helper="First reached QC"
				/>
				<KpiCard
					label="Per day worked"
					value={
						hasDaysWorked
							? oneDecimalFormatter.format(current?.per_day_worked ?? 0)
							: "—"
					}
					delta={hasDaysWorked ? (shownDeltas?.per_day_worked ?? null) : null}
				/>
				<KpiCard
					label="QC reject rate"
					value={percentFormatter.format(current?.qc_reject_rate ?? 0)}
					delta={shownDeltas?.qc_reject_rate ?? null}
					deltaAs="points"
					isLowerBetter
					helper={
						current ? (
							`${outOf(current.qc_rejects, current.qc_checks)} ${current.qc_checks === 1 ? "check" : "checks"}`
						) : (
							<TextSkeleton className="w-28" />
						)
					}
				/>
				<KpiCard
					label="Complaint rate"
					value={percentFormatter.format(current?.complaint_rate ?? 0)}
					delta={shownDeltas?.complaint_rate ?? null}
					deltaAs="points"
					isLowerBetter
					helper={
						current ? (
							`${outOf(current.complaints, current.complaint_cohort)} finished`
						) : (
							<TextSkeleton className="w-20" />
						)
					}
				/>
			</KpiRow>

			{isReady ? (
				<>
					<NeedsALook workers={workers} />

					<Section id="workers-rows" title="Workers" aside={allStoresLink}>
						<WorkersTable
							// A new range opens its own busiest Store.
							key={`${data.from}:${data.to}:${workers.length > 0}`}
							workers={workers}
							isAllStores={isAllStores}
							isToday={data.is_today}
							onOpen={handleOpen}
						/>
					</Section>

					<Section
						id="workers-services"
						title="Services by worker"
						aside={allStoresLink}
					>
						<ServicesByWorker
							data={data}
							isAllStores={isAllStores}
							onStoreChange={onStoreChange}
						/>
					</Section>
				</>
			) : (
				<Skeleton className="h-80 rounded-lg" />
			)}
		</div>
	);
};
