import type {
	WorkerDetailReport,
	WorkerProductivityReport,
	WorkerRow,
} from "@/features/reports/api";
import { escapeCsv } from "@/features/reports/utils/csv";
import {
	fixedPercentFormatter,
	numberFormatter,
} from "@/features/reports/utils/format";
import dayjs from "@/lib/dayjs";

type MatrixCell = WorkerProductivityReport["services_matrix"]["cells"][number];
type DetailBucket = WorkerDetailReport["buckets"][number];
type DetailService = WorkerDetailReport["services"][number];

// The owner will set these lines in Settings (GitHub issue #159); until then a
// QC reject or Complaint chip is coloured from this one block.
const WORKER_TONES = {
	// Under this many checks one reject swings the rate by 5 points or more.
	minChecksForQcRate: 20,
	qcGoodBelow: 0.08,
	qcBadFrom: 0.12,
	complaintBadFrom: 0.02,
} as const;

export type Tone = "neutral" | "good" | "warn" | "bad";

export const qcTone = (rejects: number, checks: number): Tone => {
	if (checks < WORKER_TONES.minChecksForQcRate) {
		return "neutral";
	}
	const rate = rejects / checks;
	if (rate < WORKER_TONES.qcGoodBelow) {
		return "good";
	}
	return rate < WORKER_TONES.qcBadFrom ? "warn" : "bad";
};

export const complaintTone = (complaints: number, finished: number): Tone => {
	if (complaints === 0) {
		return "neutral";
	}
	return complaints / finished >= WORKER_TONES.complaintBadFrom
		? "bad"
		: "warn";
};

export const outOf = (part: number, whole: number) =>
	`${numberFormatter.format(part)}/${numberFormatter.format(whole)}`;

// The rate shows only once there are enough checks for it to mean something.
export const qcText = (rejects: number, checks: number) =>
	checks >= WORKER_TONES.minChecksForQcRate
		? `${outOf(rejects, checks)} · ${fixedPercentFormatter.format(rejects / checks)}`
		: outOf(rejects, checks);

export interface WorkerTotals {
	people: number;
	services: number;
	perDayWorked: number | null;
	qcRejects: number;
	qcChecks: number;
	complaints: number;
	complaintCohort: number;
}

// Only Services started by someone with a day worked count towards the rate.
export const totalsOf = (rows: WorkerRow[]): WorkerTotals => {
	const totals: WorkerTotals = {
		people: rows.length,
		services: 0,
		perDayWorked: null,
		qcRejects: 0,
		qcChecks: 0,
		complaints: 0,
		complaintCohort: 0,
	};
	let staffedServices = 0;
	let daysWorked = 0;
	for (const row of rows) {
		totals.services += row.services_processed;
		totals.qcRejects += row.qc_rejects;
		totals.qcChecks += row.qc_checks;
		totals.complaints += row.complaints;
		totals.complaintCohort += row.complaint_cohort;
		if (row.days_worked > 0) {
			staffedServices += row.services_processed;
			daysWorked += row.days_worked;
		}
	}
	totals.perDayWorked = daysWorked > 0 ? staffedServices / daysWorked : null;
	return totals;
};

interface StoreGroup {
	store_id: number;
	store_name: string;
	rows: WorkerRow[];
	totals: WorkerTotals;
}

// Busiest Store first, so the owner opens the one that matters most.
export const groupByStore = (rows: WorkerRow[]): StoreGroup[] => {
	const byStore = new Map<number, WorkerRow[]>();
	for (const row of rows) {
		byStore.set(row.store_id, [...(byStore.get(row.store_id) ?? []), row]);
	}
	return [...byStore.values()]
		.map((storeRows) => ({
			store_id: storeRows[0].store_id,
			store_name: storeRows[0].store_name,
			rows: storeRows,
			totals: totalsOf(storeRows),
		}))
		.sort((a, b) => b.totals.services - a.totals.services);
};

export const workerKey = (userId: number, storeId: number) =>
	`${userId}:${storeId}`;

const cellKey = (userId: number, storeId: number, serviceId: number) =>
	`${workerKey(userId, storeId)}:${serviceId}`;

export const buildCountIndex = (cells: MatrixCell[]) => {
	const counts = new Map<string, number>();
	const rowTotals = new Map<string, number>();
	for (const cell of cells) {
		counts.set(
			cellKey(cell.user_id, cell.store_id, cell.service_id),
			cell.count,
		);
		const key = workerKey(cell.user_id, cell.store_id);
		rowTotals.set(key, (rowTotals.get(key) ?? 0) + cell.count);
	}
	return {
		count: (userId: number, storeId: number, serviceId: number) =>
			counts.get(cellKey(userId, storeId, serviceId)) ?? 0,
		rowTotal: (userId: number, storeId: number) =>
			rowTotals.get(workerKey(userId, storeId)) ?? 0,
	};
};

export const avgPerDay = (count: number, daysWorked: number) =>
	daysWorked > 0 ? Number((count / daysWorked).toFixed(1)) : null;

export const TOP_SERVICES_IN_CHART = 4;

// The biggest few Services get a colour; the rest share one grey slice.
export const splitTopServices = (
	services: DetailService[],
	limit = TOP_SERVICES_IN_CHART,
) => {
	const sorted = [...services].sort(
		(a, b) => b.count - a.count || a.service_name.localeCompare(b.service_name),
	);
	return { top: sorted.slice(0, limit), rest: sorted.slice(limit) };
};

export interface ChartRow {
	label: string;
	total: number | null;
	storeAverage: number | null;
	// Count per top Service by position, then the grey rest.
	slices: (number | undefined)[];
	other: number | undefined;
	services: DetailBucket["services"];
}

export const buildChartRows = (
	buckets: DetailBucket[],
	topIds: number[],
): ChartRow[] =>
	buckets.map((bucket) => {
		const counts = new Map(bucket.services.map((s) => [s.service_id, s.count]));
		const topSum = topIds.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
		const hasBar = bucket.total !== null && bucket.total > 0;
		return {
			label: bucket.label,
			total: bucket.total,
			storeAverage: bucket.store_average,
			slices: topIds.map((id) => (hasBar ? (counts.get(id) ?? 0) : undefined)),
			other: hasBar ? (bucket.total ?? 0) - topSum : undefined,
			services: [...bucket.services].sort((a, b) => b.count - a.count),
		};
	});

// Daily labels would collide, so they show on Mondays plus the ends of the
// range; a week's label always shows.
export const axisTickLabels = (
	labels: string[],
	bucket: WorkerDetailReport["bucket"],
) => {
	if (bucket === "week") {
		return labels;
	}
	const shown = new Set<number>();
	for (const [index, label] of labels.entries()) {
		if (dayjs(label).day() === 1) {
			shown.add(index);
		}
	}
	const isClear = (index: number) =>
		[...shown].every((other) => Math.abs(other - index) >= 3);
	for (const end of [0, labels.length - 1]) {
		if (end >= 0 && isClear(end)) {
			shown.add(end);
		}
	}
	return labels.filter((_, index) => shown.has(index));
};

export const buildWorkersCsv = (data: WorkerProductivityReport) => {
	const lines = [
		"Workers,Store,Worker,Role,Days worked,Services,Per day worked,QC rejects,QC checks,Complaints,Complaint cohort",
	];
	for (const w of data.workers) {
		lines.push(
			[
				"Workers",
				escapeCsv(w.store_name),
				escapeCsv(w.user_name),
				w.role,
				w.days_worked,
				w.services_processed,
				escapeCsv(w.per_day_worked),
				w.qc_rejects,
				w.qc_checks,
				w.complaints,
				w.complaint_cohort,
			].join(","),
		);
	}

	const { count } = buildCountIndex(data.services_matrix.cells);
	lines.push("", "Services by worker,Store,Worker,Service,Count,Avg/day");
	for (const w of data.workers) {
		for (const service of data.services_matrix.services) {
			const n = count(w.user_id, w.store_id, service.service_id);
			if (n > 0) {
				lines.push(
					`Services by worker,${escapeCsv(w.store_name)},${escapeCsv(w.user_name)},${escapeCsv(service.service_name)},${n},${escapeCsv(avgPerDay(n, w.days_worked))}`,
				);
			}
		}
	}
	return lines.join("\n");
};
