// Orders in is green and Orders out is red, soft enough to sit side by side.
export const ORDERS_IN_COLOR = "oklch(0.74 0.12 150)";
export const ORDERS_OUT_COLOR = "oklch(0.72 0.12 25)";

export const TURNAROUND_COLORS = {
	dot: "oklch(0.7 0.09 240 / 0.55)",
	dotStrong: "oklch(0.55 0.13 240)",
	p75: "oklch(0.62 0.1 160)",
	p90: "oklch(0.68 0.11 75)",
	p99: "oklch(0.62 0.13 25)",
	queued: "oklch(0.85 0.09 75)",
	inProgress: "oklch(0.8 0.07 240)",
} as const;

export const PERCENTILE_KEYS = [
	["p75", TURNAROUND_COLORS.p75],
	["p90", TURNAROUND_COLORS.p90],
	["p99", TURNAROUND_COLORS.p99],
] as const;

export const CHART_PALETTE = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
	"var(--chart-6)",
	"var(--chart-7)",
	"var(--chart-8)",
	"var(--chart-9)",
	"var(--chart-10)",
] as const;
