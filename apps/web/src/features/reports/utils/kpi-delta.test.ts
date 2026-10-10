import { describe, expect, it } from "bun:test";
import {
	formatKpiDeltaChange,
	kpiDeltaChange,
} from "@/features/reports/utils/kpi-delta";

const show = (
	delta: { current: number; previous: number; delta_pct: number | null },
	deltaAs: "percent" | "points",
) => formatKpiDeltaChange(kpiDeltaChange(delta, deltaAs), deltaAs);

describe("a rate KPI's change", () => {
	it("reads as points moved", () => {
		expect(
			show({ current: 0.625, previous: 0.604, delta_pct: 0.0348 }, "points"),
		).toBe("+2.1 pts");
		expect(
			show({ current: 0.4, previous: 0.5, delta_pct: -0.2 }, "points"),
		).toBe("-10.0 pts");
	});

	it("reads as level when the rate held", () => {
		expect(show({ current: 0.5, previous: 0.5, delta_pct: 0 }, "points")).toBe(
			"±0.0 pts",
		);
	});

	it("reads as level when the move rounds to nothing", () => {
		expect(
			show({ current: 0.5003, previous: 0.5, delta_pct: 0.0006 }, "points"),
		).toBe("±0.0 pts");
		expect(
			show({ current: 0.4997, previous: 0.5, delta_pct: -0.0006 }, "points"),
		).toBe("±0.0 pts");
		expect(
			kpiDeltaChange(
				{ current: 0.4997, previous: 0.5, delta_pct: -0.0006 },
				"points",
			),
		).toBe(0);
	});

	it("still has points when last period was zero", () => {
		expect(
			show({ current: 0.25, previous: 0, delta_pct: null }, "points"),
		).toBe("+25.0 pts");
	});
});

describe("a count KPI's change", () => {
	it("reads as percent growth", () => {
		expect(show({ current: 3, previous: 1, delta_pct: 2 }, "percent")).toBe(
			"+200.0%",
		);
		expect(show({ current: 1, previous: 1, delta_pct: 0 }, "percent")).toBe(
			"±0.0%",
		);
		expect(show({ current: 3, previous: 0, delta_pct: null }, "percent")).toBe(
			"—",
		);
	});
});
