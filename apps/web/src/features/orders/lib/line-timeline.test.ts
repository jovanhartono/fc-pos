import { describe, expect, it } from "bun:test";
import {
	buildLineTimeline,
	getFirstPickupAt,
	type TimelineLine,
} from "./line-timeline";

const cashier = { name: "Cahya" };
const worker = { name: "Sari" };

const complaint = {
	id: 5,
	created_at: "2026-09-20T03:00:00.000Z",
	reason: "Sole still stained",
	openedBy: cashier,
};

const notOpened = { rework_opened_at: null, rework_opened_by: null };

const log = (
	id: number,
	from_status: string | null,
	to_status: string,
	created_at: string,
	changedBy = worker,
) => ({ id, from_status, to_status, created_at, changedBy, note: null });

const summary = (line: TimelineLine) =>
	buildLineTimeline(line).map((entry) => [
		entry.label,
		entry.at,
		entry.by,
		entry.reworkLineId ?? null,
	]);

describe("a rework line's timeline", () => {
	it("starts with the round being opened, not a bare Queued", () => {
		const entries = buildLineTimeline({
			id: 20,
			rework_opened_at: "2026-09-22T02:00:00.000Z",
			rework_opened_by: cashier,
			statusLogs: [
				log(1, null, "queued", "2026-09-22T02:00:00.000Z", cashier),
				log(2, "queued", "processing", "2026-09-22T05:00:00.000Z"),
			],
			complaints: [],
			reworkOf: complaint,
		});

		expect(entries.map((entry) => [entry.label, entry.at, entry.by])).toEqual([
			["Rework opened", "2026-09-22T02:00:00.000Z", "Cahya"],
			["In Progress", "2026-09-22T05:00:00.000Z", "Sari"],
		]);
		expect(entries[0].note).toBe("Sole still stained");
	});

	it("leaves a round the server could not date undated", () => {
		expect(
			summary({
				id: 20,
				...notOpened,
				statusLogs: [],
				complaints: [],
				reworkOf: complaint,
			}),
		).toEqual([["Rework opened", null, null, null]]);
	});
});

describe("the original's first pickup, as a rework reads it", () => {
	const pickedUpAt = (picked_up_at: string | null) => ({
		orderService: {
			pickupEvent: picked_up_at === null ? null : { picked_up_at },
		},
	});

	it("is the pickup of a pair that went home before this round was opened", () => {
		// Turned down at the counter with no rework, taken home anyway, and
		// brought back two days later for the re-clean.
		expect(
			getFirstPickupAt(
				pickedUpAt("2026-09-20T05:00:00.000Z"),
				"2026-09-22T02:00:00.000Z",
			),
		).toBe("2026-09-20T05:00:00.000Z");
	});

	it("is none when the pair only left with its rework", () => {
		expect(
			getFirstPickupAt(
				pickedUpAt("2026-09-24T09:00:00.000Z"),
				complaint.created_at,
			),
		).toBeNull();
	});

	it("keeps the pickup of an undated round, from when complaints came only after one", () => {
		expect(getFirstPickupAt(pickedUpAt("2026-09-19T05:00:00.000Z"), null)).toBe(
			"2026-09-19T05:00:00.000Z",
		);
		expect(getFirstPickupAt(pickedUpAt(null), null)).toBeNull();
	});
});

describe("the complained line's timeline", () => {
	it("reads the counter story in order: ready, complaint, rework, picked up", () => {
		expect(
			summary({
				id: 10,
				...notOpened,
				statusLogs: [
					log(
						1,
						"quality_check",
						"ready_for_pickup",
						"2026-09-19T08:00:00.000Z",
					),
					log(2, "ready_for_pickup", "picked_up", "2026-09-24T09:00:00.000Z"),
				],
				complaints: [
					{
						...complaint,
						reworkLines: [
							{
								id: 11,
								rework_opened_at: complaint.created_at,
								rework_opened_by: cashier,
							},
							{ id: 20, ...notOpened },
						],
					},
				],
				reworkOf: null,
			}),
		).toEqual([
			["Ready for Pickup", "2026-09-19T08:00:00.000Z", "Sari", null],
			["Complaint opened", complaint.created_at, "Cahya", null],
			["Rework started", complaint.created_at, "Cahya", 11],
			["Rework started", null, null, 20],
			["Picked Up", "2026-09-24T09:00:00.000Z", "Sari", null],
		]);
	});
});
