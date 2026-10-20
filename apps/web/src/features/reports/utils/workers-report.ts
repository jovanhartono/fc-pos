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
type Live = WorkerRow["live"];

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

// "5m", "1h", "5h 55m", and "9d 3h" for a Shift someone forgot to close.
export const durationText = (minutes: number) => {
	if (minutes < 60) {
		return `${minutes}m`;
	}
	if (minutes >= 24 * 60) {
		const hoursLeft = Math.floor((minutes % (24 * 60)) / 60);
		const days = `${Math.floor(minutes / (24 * 60))}d`;
		return hoursLeft === 0 ? days : `${days} ${hoursLeft}h`;
	}
	const rest = minutes % 60;
	const hours = `${Math.floor(minutes / 60)}h`;
	return rest === 0 ? hours : `${hours} ${rest}m`;
};

const minutesSince = (value: string, now: number) =>
	Math.max(0, dayjs(now).diff(dayjs(value), "minute"));

export const sinceText = (value: string | null, now: number) =>
	value ? durationText(minutesSince(value, now)) : "—";

// The server sends the open Shift, or else the last one clocked in today.
export const openShiftSince = (live: Live) =>
	live.clock_out_at === null ? live.clock_in_at : null;

// Moved Items or finished Services today with no Shift today at all.
export const isMissingClockIn = (live: Live) =>
	live.clock_in_at === null &&
	(live.services_today > 0 || live.last_move_at !== null);

// The owner will set these in Settings (GitHub issue #159), like WORKER_TONES.
export const NEEDS_A_LOOK = {
	// On shift this long with nothing reaching QC today.
	idleShiftMinutes: 120,
	// More Items in hand than one person can be working on.
	maxInHand: 20,
} as const;

export interface Flag {
	key: string;
	row: WorkerRow;
	// Plain text either side of the part shown in red.
	before: string;
	problem: string;
	after: string;
}

const servicesText = (count: number) =>
	`${numberFormatter.format(count)} ${count === 1 ? "Service" : "Services"}`;

export const needsALook = (rows: WorkerRow[], now: number): Flag[] =>
	rows.flatMap((row) => {
		const { live } = row;
		const key = workerKey(row.user_id, row.store_id);
		const inHand = `${numberFormatter.format(live.in_hand)} in hand`;
		const openSince = openShiftSince(live);
		const shiftMinutes = openSince ? minutesSince(openSince, now) : 0;
		const flags: Flag[] = [];
		if (isMissingClockIn(live)) {
			flags.push({
				key: `${key}:clock-in`,
				row,
				before: `${servicesText(live.services_today)} today, ${inHand} — `,
				problem: "not clocked in",
				after: "",
			});
		}
		if (
			live.services_today === 0 &&
			shiftMinutes > NEEDS_A_LOOK.idleShiftMinutes
		) {
			flags.push({
				key: `${key}:idle`,
				row,
				before: `on shift ${durationText(shiftMinutes)}, `,
				problem: `${servicesText(0)} today`,
				after: "",
			});
		}
		if (live.in_hand > NEEDS_A_LOOK.maxInHand) {
			flags.push({
				key: `${key}:in-hand`,
				row,
				before: "",
				problem: inHand,
				after: `, ${numberFormatter.format(live.services_today)} reached QC today`,
			});
		}
		return flags;
	});

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
