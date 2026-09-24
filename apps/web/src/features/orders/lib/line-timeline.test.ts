import { describe, expect, it } from "bun:test";
import { buildLineTimeline, type TimelineLine } from "./line-timeline";

const cashier = { name: "Cahya" };
const worker = { name: "Sari" };

const complaint = {
	id: 5,
	created_at: "2026-09-20T03:00:00.000Z",
	reason: "Sole still stained",
	openedBy: cashier,
};

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
			statusLogs: [
				log(1, null, "queued", "2026-09-22T02:00:00.000Z", cashier),
				log(2, "queued", "processing", "2026-09-22T05:00:00.000Z"),
			],
			complaints: [],
			reworkOf: { ...complaint, reworkLines: [{ id: 11 }] },
		});

		expect(entries.map((entry) => [entry.label, entry.at, entry.by])).toEqual([
			["Rework opened", "2026-09-22T02:00:00.000Z", "Cahya"],
			["In Progress", "2026-09-22T05:00:00.000Z", "Sari"],
		]);
		expect(entries[0].note).toBe("Sole still stained");
	});

	it("dates an older first round by the complaint it was opened with", () => {
		expect(
			summary({
				id: 11,
				statusLogs: [],
				complaints: [],
				reworkOf: { ...complaint, reworkLines: [{ id: 11 }] },
			}),
		).toEqual([["Rework opened", complaint.created_at, "Cahya", null]]);
	});

	it("leaves an older later round undated rather than guess", () => {
		expect(
			summary({
				id: 20,
				statusLogs: [],
				complaints: [],
				reworkOf: { ...complaint, reworkLines: [{ id: 11 }] },
			}),
		).toEqual([["Rework opened", null, null, null]]);
	});
});

describe("the complained line's timeline", () => {
	it("reads the counter story in order: ready, complaint, rework, picked up", () => {
		expect(
			summary({
				id: 10,
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
								statusLogs: [
									{ created_at: complaint.created_at, changedBy: cashier },
								],
							},
							{ id: 20, statusLogs: [] },
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
