import { describe, expect, it } from "bun:test";
import {
	comparedPeriodLabel,
	countChange,
	FIGURE_COUNTS,
	figuresOf,
} from "@/features/users/utils/my-performance";

const workerFacts = {
	services_processed: 0,
	days_worked: 0,
	per_day_worked: null,
	qc_checks: 0,
	qc_rejects: 0,
	complaints: 0,
	complaint_cohort: 0,
};

const window = {
	previous_window: { from: "2026-10-01", to: "2026-10-12" },
};

const cashierFacts = {
	orders_created: 0,
	pickups: 0,
	pickup_notices: 0,
	shift_days: 0,
	qc_checks_done: 0,
};

const courierFacts = { orders_collected: 0, items_collected: 0 };

// The placeholder rows stand in for these, so the list must not change height.
describe("each role's list of figures", () => {
	const cases = [
		["worker", workerFacts],
		["cashier", cashierFacts],
		["courier", courierFacts],
	] as const;
	for (const [role, facts] of cases) {
		it(`a ${role}'s has as many rows as its placeholders`, () => {
			const figures = figuresOf({
				role,
				...window,
				current: facts,
				previous: facts,
			} as Parameters<typeof figuresOf>[0]);
			expect(figures).toHaveLength(FIGURE_COUNTS[role]);
		});
	}
});

describe("a change against the period before", () => {
	it("is green when a count goes up", () => {
		expect(countChange(141, 124)).toEqual({ text: "+17", isBetter: true });
	});

	it("is red when a count goes down", () => {
		expect(countChange(10, 11)).toEqual({ text: "−1", isBetter: false });
	});

	it("is green when Complaints go down", () => {
		expect(countChange(1, 3, false)).toEqual({ text: "−2", isBetter: true });
	});

	// A first month on the job has nothing to be compared with.
	it("is left out after a quiet period", () => {
		expect(countChange(12, 0)).toBeNull();
	});

	it("says Same when nothing moved", () => {
		expect(countChange(5, 5)).toEqual({ text: "Same", isBetter: null });
	});
});

describe("a worker's QC rejects", () => {
	const figure = (now: object, before: object) =>
		figuresOf({
			role: "worker",
			...window,
			current: { ...workerFacts, ...now },
			previous: { ...workerFacts, ...before },
		}).find((item) => item.label === "QC rejects");

	it("compares the rate in points once both periods have 20 checks", () => {
		expect(
			figure(
				{ qc_checks: 100, qc_rejects: 9 },
				{ qc_checks: 100, qc_rejects: 11 },
			)?.change,
		).toEqual({ text: "−2,0 pts", isBetter: true });
	});

	it("leaves the change out under 20 checks", () => {
		expect(
			figure(
				{ qc_checks: 100, qc_rejects: 9 },
				{ qc_checks: 12, qc_rejects: 1 },
			)?.change,
		).toBeNull();
	});
});

describe("the period a change is measured against", () => {
	it("names a whole month", () => {
		expect(comparedPeriodLabel("2026-09-01", "2026-09-30")).toBe("September");
	});

	it("gives the days inside one month", () => {
		expect(comparedPeriodLabel("2026-10-01", "2026-10-12")).toBe("1–12 Oct");
	});

	// On the 1st, This Month is one day against the 1st of last month.
	it("gives a single day once", () => {
		expect(comparedPeriodLabel("2026-10-01", "2026-10-01")).toBe("1 Oct");
	});

	it("gives both ends across two months", () => {
		expect(comparedPeriodLabel("2026-10-30", "2026-11-05")).toBe(
			"30 Oct – 5 Nov",
		);
	});
});
