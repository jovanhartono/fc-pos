import {
	numberFormatter,
	oneDecimalFormatter,
} from "@/features/reports/utils/format";
import { WORKER_TONES } from "@/features/reports/utils/workers-report";
import type { OwnPerformance } from "@/features/users/api";
import dayjs from "@/lib/dayjs";

type Measured = Exclude<OwnPerformance, { role: "admin" }>;
export type MeasuredRole = Measured["role"];

// The placeholder rows drawn before the figures arrive, so the list doesn't grow.
export const FIGURE_COUNTS: Record<MeasuredRole, number> = {
	worker: 4,
	cashier: 5,
	courier: 2,
};

// isBetter is null when nothing moved.
export interface FigureChange {
	text: string;
	isBetter: boolean | null;
}

export type FigureValue =
	| { kind: "number"; text: string }
	| { kind: "qc"; rejects: number; checks: number }
	| { kind: "complaints"; complaints: number; finished: number };

export interface Figure {
	label: string;
	value: FigureValue;
	change: FigureChange | null;
}

const changeOf = (
	delta: number,
	formatter: Intl.NumberFormat,
	isHigherBetter: boolean,
	suffix = "",
): FigureChange => {
	if (delta === 0) {
		return { text: "Same", isBetter: null };
	}
	const sign = delta > 0 ? "+" : "−";
	return {
		text: `${sign}${formatter.format(Math.abs(delta))}${suffix}`,
		isBetter: delta > 0 === isHigherBetter,
	};
};

// A quiet previous period has nothing to compare with, as on the Reports tabs (#239).
export const countChange = (
	current: number,
	previous: number,
	isHigherBetter = true,
) =>
	previous === 0
		? null
		: changeOf(current - previous, numberFormatter, isHigherBetter);

const decimalChange = (current: number | null, previous: number | null) =>
	current === null || previous === null
		? null
		: changeOf(
				Number((current - previous).toFixed(1)),
				oneDecimalFormatter,
				true,
			);

const qcRateChange = (
	current: { qc_rejects: number; qc_checks: number },
	previous: { qc_rejects: number; qc_checks: number },
) => {
	const { minChecksForQcRate } = WORKER_TONES;
	if (
		current.qc_checks < minChecksForQcRate ||
		previous.qc_checks < minChecksForQcRate
	) {
		return null;
	}
	const points =
		Math.round(
			(current.qc_rejects / current.qc_checks -
				previous.qc_rejects / previous.qc_checks) *
				1000,
		) / 10;
	return changeOf(points, oneDecimalFormatter, false, " pts");
};

const countFigure = (
	label: string,
	current: number,
	previous: number,
): Figure => ({
	label,
	value: { kind: "number", text: numberFormatter.format(current) },
	change: countChange(current, previous),
});

export const figuresOf = (performance: Measured): Figure[] => {
	if (performance.role === "worker") {
		const { current: now, previous: before } = performance;
		return [
			countFigure(
				"Services processed",
				now.services_processed,
				before.services_processed,
			),
			{
				label: "Per day worked",
				value: {
					kind: "number",
					text:
						now.per_day_worked === null
							? "—"
							: oneDecimalFormatter.format(now.per_day_worked),
				},
				change: decimalChange(now.per_day_worked, before.per_day_worked),
			},
			{
				label: "QC rejects",
				value: { kind: "qc", rejects: now.qc_rejects, checks: now.qc_checks },
				change: qcRateChange(now, before),
			},
			{
				label: "Complaints",
				value: {
					kind: "complaints",
					complaints: now.complaints,
					finished: now.complaint_cohort,
				},
				change: countChange(now.complaints, before.complaints, false),
			},
		];
	}

	if (performance.role === "cashier") {
		const { current: now, previous: before } = performance;
		return [
			countFigure("Orders created", now.orders_created, before.orders_created),
			countFigure("Pickups processed", now.pickups, before.pickups),
			countFigure(
				"Pickup notices sent",
				now.pickup_notices,
				before.pickup_notices,
			),
			countFigure("Shifts", now.shift_days, before.shift_days),
			countFigure("QC checks done", now.qc_checks_done, before.qc_checks_done),
		];
	}

	const { current: now, previous: before } = performance;
	return [
		countFigure(
			"Orders collected",
			now.orders_collected,
			before.orders_collected,
		),
		countFigure("Items collected", now.items_collected, before.items_collected),
	];
};

// "October" for a whole month, "1–12 Oct" inside one, "30 Oct – 5 Nov" across two.
export const comparedPeriodLabel = (from: string, to: string) => {
	const start = dayjs(from);
	const end = dayjs(to);
	if (start.date() === 1 && end.isSame(start.endOf("month"), "day")) {
		return start.format("MMMM");
	}
	if (start.isSame(end, "day")) {
		return end.format("D MMM");
	}
	if (start.isSame(end, "month")) {
		return `${start.date()}–${end.format("D MMM")}`;
	}
	return `${start.format("D MMM")} – ${end.format("D MMM")}`;
};
