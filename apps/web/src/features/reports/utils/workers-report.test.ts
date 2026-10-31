import { describe, expect, it } from "bun:test";
import type {
	WorkerLiveRow,
	WorkerRangeRow,
	WorkerRow,
} from "@/features/reports/api";
import {
	buildChartRows,
	complaintTone,
	durationText,
	groupByStore,
	isMissingClockIn,
	NEEDS_A_LOOK,
	needsALook,
	openShiftSince,
	outOf,
	qcText,
	qcTone,
	sinceText,
	splitTopServices,
	totalsOf,
	withLive,
} from "@/features/reports/utils/workers-report";
import { formatShiftLength } from "@/lib/dayjs";

const quiet: WorkerRow["live"] = {
	clock_in_at: null,
	clock_out_at: null,
	in_hand: 0,
	last_move_at: null,
	services_today: 0,
};

const worker = (overrides: Partial<WorkerRow>): WorkerRow =>
	({
		user_id: 1,
		user_name: "Ani",
		role: "worker",
		store_id: 1,
		store_name: "Kemang",
		days_worked: 0,
		services_processed: 0,
		per_day_worked: null,
		qc_checks: 0,
		qc_rejects: 0,
		complaints: 0,
		complaint_cohort: 0,
		live: quiet,
		...overrides,
	}) as WorkerRow;

describe("QC reject tone", () => {
	it("stays grey under 20 checks, however many rejects", () => {
		expect(qcTone(5, 19)).toBe("neutral");
		expect(qcTone(0, 0)).toBe("neutral");
	});

	it("is green under 8%, amber from 8% to under 12%, red from 12%", () => {
		expect(qcTone(7, 100)).toBe("good");
		expect(qcTone(8, 100)).toBe("warn");
		expect(qcTone(11, 100)).toBe("warn");
		expect(qcTone(12, 100)).toBe("bad");
	});
});

describe("Complaint tone", () => {
	it("is grey for none, amber for any, red from 2% of finished", () => {
		expect(complaintTone(0, 159)).toBe("neutral");
		expect(complaintTone(1, 159)).toBe("warn");
		expect(complaintTone(2, 100)).toBe("bad");
	});
});

describe("x/y text", () => {
	it("shows the rate only from 20 checks", () => {
		expect(qcText(9, 168)).toBe("9/168 · 5,4%");
		expect(qcText(1, 19)).toBe("1/19");
		expect(outOf(0, 159)).toBe("0/159");
	});
});

describe("Store totals", () => {
	const rows = [
		worker({
			days_worked: 2,
			services_processed: 10,
			qc_checks: 8,
			qc_rejects: 1,
			complaints: 1,
			complaint_cohort: 9,
		}),
		worker({ user_id: 2, days_worked: 0, services_processed: 4 }),
		worker({ user_id: 3, days_worked: 3, services_processed: 20 }),
	];

	it("adds the counts and rates only the staffed Services", () => {
		const totals = totalsOf(rows);
		expect(totals.people).toBe(3);
		expect(totals.services).toBe(34);
		expect(totals.qcChecks).toBe(8);
		expect(totals.complaintCohort).toBe(9);
		expect(totals.perDayWorked).toBe(6);
	});

	it("does not count someone shown only for what they are doing today", () => {
		const onTheFloor = worker({
			user_id: 4,
			live: { ...quiet, in_hand: 3, services_today: 1 },
		});
		expect(totalsOf([...rows, onTheFloor]).people).toBe(3);
	});

	it("has no rate when nobody worked a day", () => {
		expect(
			totalsOf([worker({ services_processed: 3 })]).perDayWorked,
		).toBeNull();
	});

	it("lists the busiest Store first", () => {
		const groups = groupByStore([
			worker({ store_id: 1, store_name: "Kemang", services_processed: 5 }),
			worker({ store_id: 2, store_name: "BSD", services_processed: 9 }),
			worker({ user_id: 2, store_id: 1, store_name: "Kemang" }),
		]);
		expect(groups.map((g) => g.store_name)).toEqual(["BSD", "Kemang"]);
		expect(groups[1].rows).toHaveLength(2);
	});
});

describe("the range joined with who is on the floor", () => {
	const rangeRow = (overrides: Partial<WorkerRangeRow>): WorkerRangeRow => {
		const { live: _, ...row } = worker(overrides);
		return row;
	};
	const liveRow = (
		overrides: Partial<WorkerLiveRow>,
		live: Partial<WorkerRow["live"]>,
	): WorkerLiveRow => ({
		user_id: 1,
		user_name: "Ani",
		role: "worker",
		store_id: 1,
		store_name: "Kemang",
		live: { ...quiet, ...live },
		...overrides,
	});

	it("puts each person's live figures on their range row", () => {
		const rows = withLive(
			[rangeRow({ services_processed: 12 })],
			[liveRow({}, { in_hand: 2 })],
		);
		expect(rows).toEqual([
			worker({ services_processed: 12, live: { ...quiet, in_hand: 2 } }),
		]);
	});

	it("leaves a range row off the floor when nothing is happening now", () => {
		expect(withLive([rangeRow({})], [])[0].live).toEqual(quiet);
	});

	it("keeps the same person at another Store apart", () => {
		const rows = withLive(
			[rangeRow({ services_processed: 5 })],
			[liveRow({ store_id: 2, store_name: "BSD" }, { in_hand: 1 })],
		);
		expect(rows.map((row) => [row.store_name, row.live.in_hand])).toEqual([
			["BSD", 1],
			["Kemang", 0],
		]);
	});

	it("adds someone busy today with nothing in the range, after the busy rows", () => {
		const rows = withLive(
			[rangeRow({ user_id: 1, user_name: "Ani", services_processed: 4 })],
			[liveRow({ user_id: 2, user_name: "Adi" }, { services_today: 1 })],
		);
		expect(rows.map((row) => row.user_name)).toEqual(["Ani", "Adi"]);
		expect(rows[1]).toEqual(
			worker({
				user_id: 2,
				user_name: "Adi",
				live: { ...quiet, services_today: 1 },
			}),
		);
	});

	it("shows the range alone while the live view has not loaded", () => {
		expect(withLive([rangeRow({})])).toHaveLength(1);
	});
});

describe("right now", () => {
	const now = new Date("2026-10-19T10:00:00+07:00").getTime();
	const at = (local: string) => `2026-10-19T${local}:00+07:00`;
	const live = (overrides: Partial<WorkerRow["live"]>) => ({
		...quiet,
		...overrides,
	});

	it("is on shift only while a Shift is open", () => {
		expect(openShiftSince(live({ clock_in_at: at("08:00") }))).toBe(
			at("08:00"),
		);
		expect(
			openShiftSince(
				live({ clock_in_at: at("08:00"), clock_out_at: at("09:00") }),
			),
		).toBeNull();
	});

	it("misses a clock-in only for someone who worked today with no Shift today", () => {
		expect(isMissingClockIn(live({ services_today: 1 }))).toBe(true);
		expect(isMissingClockIn(live({ last_move_at: at("09:00") }))).toBe(true);
		// Went home after a Shift today.
		expect(
			isMissingClockIn(
				live({
					services_today: 1,
					clock_in_at: at("07:00"),
					clock_out_at: at("09:00"),
				}),
			),
		).toBe(false);
		// Items in hand from an earlier day are not work today.
		expect(isMissingClockIn(live({ in_hand: 3 }))).toBe(false);
	});

	it("says how long since the last move", () => {
		expect(sinceText(at("09:59"), now)).toBe("1m");
		expect(sinceText(at("08:00"), now)).toBe("2h");
		expect(sinceText(at("04:05"), now)).toBe("5h 55m");
		expect(sinceText(null, now)).toBe("—");
	});

	it("counts a last move from days ago in days", () => {
		expect(durationText(219 * 60 + 30)).toBe("9d 3h");
		expect(durationText(48 * 60)).toBe("2d");
	});

	it("writes a Shift's length the way Shifts and Attendance do", () => {
		expect(formatShiftLength(45)).toBe("45m");
		expect(formatShiftLength(60)).toBe("1h 00m");
		expect(formatShiftLength(5 * 60 + 5)).toBe("5h 05m");
		expect(formatShiftLength(8 * 60)).toBe("8h 00m");
		// A forgotten Shift, in days.
		expect(formatShiftLength(50 * 60)).toBe("2d 2h");
		expect(formatShiftLength(48 * 60)).toBe("2d");
	});
});

describe("Needs a look", () => {
	const now = new Date("2026-10-19T14:00:00+07:00").getTime();
	const flagText = (row: WorkerRow) =>
		needsALook([row], now).map(
			({ before, problem, after }) => `${before}[${problem}]${after}`,
		);

	it("flags work today with no Shift", () => {
		expect(
			flagText(
				worker({
					live: { ...quiet, services_today: 10, in_hand: 10 },
				}),
			),
		).toEqual(["10 Services today, 10 in hand — [not clocked in]"]);
	});

	it("flags an open Shift past the idle limit with nothing reaching QC today", () => {
		const since = (minutes: number) =>
			new Date(now - minutes * 60_000).toISOString();
		expect(
			flagText(worker({ live: { ...quiet, clock_in_at: since(355) } })),
		).toEqual(["on shift 5h 55m, [0 Services today]"]);
		expect(
			flagText(worker({ live: { ...quiet, clock_in_at: since(305) } })),
		).toEqual(["on shift 5h 05m, [0 Services today]"]);
		expect(
			flagText(worker({ live: { ...quiet, clock_in_at: since(50 * 60) } })),
		).toEqual(["on shift 2d 2h, [0 Services today]"]);
		expect(
			flagText(
				worker({
					live: {
						...quiet,
						clock_in_at: since(NEEDS_A_LOOK.idleShiftMinutes),
					},
				}),
			),
		).toEqual([]);
		expect(
			flagText(
				worker({
					live: { ...quiet, clock_in_at: since(355), services_today: 1 },
				}),
			),
		).toEqual([]);
		// Doing QC checks: no Services of their own, but a recent move.
		expect(
			flagText(
				worker({
					live: {
						...quiet,
						clock_in_at: since(355),
						last_move_at: since(5),
					},
				}),
			),
		).toEqual([]);
		expect(
			flagText(
				worker({
					live: {
						...quiet,
						clock_in_at: since(355),
						last_move_at: since(NEEDS_A_LOOK.idleShiftMinutes + 1),
					},
				}),
			),
		).toEqual(["on shift 5h 55m, [0 Services today]"]);
	});

	it("flags more Items in hand than the limit", () => {
		const shift = new Date(now - 60 * 60_000).toISOString();
		expect(
			flagText(
				worker({
					live: {
						...quiet,
						clock_in_at: shift,
						in_hand: 39,
						services_today: 14,
					},
				}),
			),
		).toEqual(["[39 in hand], 14 reached QC today"]);
		expect(
			flagText(
				worker({
					live: {
						...quiet,
						clock_in_at: shift,
						in_hand: NEEDS_A_LOOK.maxInHand,
						services_today: 1,
					},
				}),
			),
		).toEqual([]);
	});

	it("gives a person with two problems two lines", () => {
		expect(
			flagText(worker({ live: { ...quiet, in_hand: 25, services_today: 1 } })),
		).toEqual([
			"1 Service today, 25 in hand — [not clocked in]",
			"[25 in hand], 1 reached QC today",
		]);
	});
});

const svc = (service_id: number, count: number) => ({
	service_id,
	service_name: `S${service_id}`,
	count,
});

describe("top Services and Other", () => {
	it("keeps the top 4 by count and leaves the rest as Other", () => {
		const { top, rest } = splitTopServices([
			svc(1, 3),
			svc(2, 9),
			svc(3, 1),
			svc(4, 7),
			svc(5, 5),
			svc(6, 2),
		]);
		expect(top.map((s) => s.service_id)).toEqual([2, 4, 5, 1]);
		expect(rest.map((s) => s.service_id)).toEqual([6, 3]);
	});

	it("puts everything outside the top into the grey slice per bucket", () => {
		const rows = buildChartRows(
			[
				{
					label: "2026-10-09",
					worked: true,
					total: 10,
					services: [svc(1, 6), svc(2, 3), svc(3, 1)],
					store_average: 8,
				},
				{
					label: "2026-10-10",
					worked: false,
					total: null,
					services: [],
					store_average: 7,
				},
				{
					label: "2026-10-11",
					worked: true,
					total: 0,
					services: [],
					store_average: null,
				},
			],
			[1, 2],
		);
		expect(rows[0].slices).toEqual([6, 3]);
		expect(rows[0].other).toBe(1);
		expect(rows[1].slices).toEqual([0, 0]);
		expect(rows[2].other).toBe(0);
	});
});
