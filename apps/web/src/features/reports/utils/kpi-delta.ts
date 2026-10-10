import type { KpiDelta } from "@/features/reports/api";

export type DeltaAs = "percent" | "points";

// A first-pass rate going from 50% to 60% is "+10.0 pts", not "+20.0%": the
// owner compares rates by how far they moved, counts by how much they grew.
// Rounded to the one decimal shown, so a move that reads 0.0 gets no arrow.
export const kpiDeltaChange = (
	delta: KpiDelta,
	deltaAs: DeltaAs,
): number | null => {
	let change: number | null = (delta.current - delta.previous) * 100;
	if (deltaAs === "percent") {
		change = delta.delta_pct === null ? null : delta.delta_pct * 100;
	}
	return change === null ? null : Math.round(change * 10) / 10 || 0;
};

export const formatKpiDeltaChange = (
	change: number | null,
	deltaAs: DeltaAs,
): string => {
	if (change === null) {
		return "—";
	}
	let sign = "";
	if (change > 0) {
		sign = "+";
	} else if (change === 0) {
		sign = "±";
	}
	return `${sign}${change.toFixed(1)}${deltaAs === "points" ? " pts" : "%"}`;
};
