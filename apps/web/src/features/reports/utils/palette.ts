// Orders out is green, not red: a pickup is the job done, not a problem.
export const ORDERS_IN_COLOR = "var(--chart-1)";
export const ORDERS_OUT_COLOR = "var(--chart-2)";

export const TURNAROUND_COLORS = {
	dot: "var(--chart-1)",
	// Slower than 9 in 10 Items: the ones worth asking about.
	late: "var(--warning)",
	percentile: "var(--foreground)",
	queued: "var(--chart-other)",
	inProgress: "var(--chart-1)",
	waitingQc: "var(--chart-4)",
} as const;

export const PERCENTILE_KEYS = ["p75", "p90", "p99"] as const;

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

export const CHART_OTHER_COLOR = "var(--chart-other)";

// A QC reject is caught in the shop (amber); a Complaint reached the Customer (red).
export const QC_COLORS = {
	arrived: CHART_OTHER_COLOR,
	passes: "var(--primary)",
	qcRejects: "var(--warning)",
	complaints: "var(--destructive)",
} as const;

// A stacked chart colours its four biggest series and greys the rest, so the
// owner reads four stripes a day instead of a rainbow.
export const topFourColor = (index: number) =>
	index < 4 ? CHART_PALETTE[index] : CHART_OTHER_COLOR;
