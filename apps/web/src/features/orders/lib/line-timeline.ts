import { formatOrderServiceStatus } from "@/lib/status";

interface Person {
	name: string;
}

interface OpeningLog {
	created_at: string;
	changedBy: Person | null;
}

interface StatusLog extends OpeningLog {
	id: number;
	from_status: string | null;
	to_status: string;
	note: string | null;
}

interface ComplaintRef {
	id: number;
	created_at: string;
	reason: string;
	openedBy: Person | null;
}

// The parts of a line both the order sheet and queue detail load, so the same
// line reads the same on either screen.
export interface TimelineLine {
	id: number;
	statusLogs: StatusLog[];
	complaints: (ComplaintRef & {
		reworkLines: { id: number; statusLogs: OpeningLog[] }[];
	})[];
	reworkOf:
		| (ComplaintRef & {
				reworkLines: { id: number }[];
		  })
		| null;
}

export interface TimelineEntry {
	key: string;
	label: string;
	at: string | null;
	by: string | null;
	note: string | null;
	// Set on the complained line's "Rework started", pointing at that round.
	reworkLineId?: number;
	sortAt: string;
}

// Who put a rework round on the rack, and when. Rounds from before that was
// logged have no record, except the first — opened with the complaint itself.
const reworkOpening = (
	complaint: ComplaintRef,
	isFirstRound: boolean,
	log: OpeningLog | undefined,
) => {
	if (log) {
		return { at: log.created_at, by: log.changedBy?.name ?? null };
	}
	if (isFirstRound) {
		return { at: complaint.created_at, by: complaint.openedBy?.name ?? null };
	}
	return { at: null, by: null };
};

const isOpeningLog = (log: StatusLog) => log.from_status === null;

export const buildLineTimeline = (line: TimelineLine): TimelineEntry[] => {
	const entries: TimelineEntry[] = [];
	const { reworkOf } = line;

	if (reworkOf) {
		const opening = reworkOpening(
			reworkOf,
			reworkOf.reworkLines[0]?.id === line.id,
			line.statusLogs.find(isOpeningLog),
		);
		entries.push({
			key: "rework-opened",
			label: "Rework opened",
			...opening,
			note: reworkOf.reason,
			sortAt: opening.at ?? reworkOf.created_at,
		});
	}

	for (const log of line.statusLogs) {
		if (reworkOf && isOpeningLog(log)) {
			continue;
		}
		entries.push({
			key: `log-${log.id}`,
			label: formatOrderServiceStatus(log.to_status),
			at: log.created_at,
			by: log.changedBy?.name ?? null,
			note: log.note,
			sortAt: log.created_at,
		});
	}

	for (const complaint of line.complaints) {
		entries.push({
			key: `complaint-${complaint.id}`,
			label: "Complaint opened",
			at: complaint.created_at,
			by: complaint.openedBy?.name ?? null,
			note: complaint.reason,
			sortAt: complaint.created_at,
		});
		complaint.reworkLines.forEach((rework, index) => {
			const opening = reworkOpening(
				complaint,
				index === 0,
				rework.statusLogs[0],
			);
			entries.push({
				key: `rework-${rework.id}`,
				label: "Rework started",
				...opening,
				note: null,
				reworkLineId: rework.id,
				sortAt: opening.at ?? complaint.created_at,
			});
		});
	}

	// Stable, so an undated round stays right after the complaint it follows.
	return entries.sort(
		(a, b) => new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime(),
	);
};
