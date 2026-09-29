import { formatOrderServiceStatus } from "@/lib/status";

interface Person {
	name: string;
}

interface StatusLog {
	id: number;
	created_at: string;
	changedBy: Person | null;
	from_status: string | null;
	to_status: string;
	note: string | null;
}

// The server works out when each round went on the rack, and who put it there.
interface ReworkOpening {
	rework_opened_at: string | null;
	rework_opened_by: Person | null;
}

interface ComplaintRef {
	id: number;
	created_at: string;
	reason: string;
	openedBy: Person | null;
}

export interface TimelineLine extends ReworkOpening {
	id: number;
	statusLogs: StatusLog[];
	complaints: (ComplaintRef & {
		reworkLines: (ReworkOpening & { id: number })[];
	})[];
	reworkOf: ComplaintRef | null;
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

interface ReworkOrigin {
	orderService: { pickupEvent: { picked_up_at: string } | null };
}

// A pair turned down at the counter leaves with its Rework in one pickup, so
// only a pickup before this round went on the rack was a first trip home.
export const getFirstPickupAt = (
	reworkOf: ReworkOrigin,
	reworkOpenedAt: string | null,
): string | null => {
	const pickupAt = reworkOf.orderService.pickupEvent?.picked_up_at ?? null;
	if (pickupAt === null || reworkOpenedAt === null) {
		return pickupAt;
	}
	return new Date(pickupAt) < new Date(reworkOpenedAt) ? pickupAt : null;
};

export const buildLineTimeline = (line: TimelineLine): TimelineEntry[] => {
	const entries: TimelineEntry[] = [];
	const { reworkOf } = line;

	if (reworkOf) {
		entries.push({
			key: "rework-opened",
			label: "Rework opened",
			at: line.rework_opened_at,
			by: line.rework_opened_by?.name ?? null,
			note: reworkOf.reason,
			sortAt: line.rework_opened_at ?? reworkOf.created_at,
		});
	}

	for (const log of line.statusLogs) {
		if (reworkOf && log.from_status === null) {
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
		for (const rework of complaint.reworkLines) {
			entries.push({
				key: `rework-${rework.id}`,
				label: "Rework started",
				at: rework.rework_opened_at,
				by: rework.rework_opened_by?.name ?? null,
				note: null,
				reworkLineId: rework.id,
				sortAt: rework.rework_opened_at ?? complaint.created_at,
			});
		}
	}

	// Stable, so an undated round stays right after the complaint it follows.
	return entries.sort(
		(a, b) => new Date(a.sortAt).getTime() - new Date(b.sortAt).getTime(),
	);
};
