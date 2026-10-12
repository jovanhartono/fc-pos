import { describe, expect, it } from "bun:test";
import type { WorkerRow } from "@/features/reports/api";
import {
	axisTickLabels,
	buildChartRows,
	complaintTone,
	groupByStore,
	outOf,
	qcText,
	qcTone,
	splitTopServices,
	totalsOf,
} from "@/features/reports/utils/workers-report";

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
		live: null,
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
		expect(rows[1].slices).toEqual([undefined, undefined]);
		expect(rows[2].other).toBe(undefined);
	});
});

describe("x axis labels", () => {
	const days = Array.from(
		{ length: 14 },
		(_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
	);

	it("shows Mondays and the ends, never two within 3 days", () => {
		// 5 and 12 Oct 2026 are Mondays.
		expect(axisTickLabels(days, "day")).toEqual([
			"2026-10-01",
			"2026-10-05",
			"2026-10-12",
		]);
	});

	it("shows every week", () => {
		expect(axisTickLabels(["2026-10-05", "2026-10-12"], "week")).toHaveLength(
			2,
		);
	});
});
