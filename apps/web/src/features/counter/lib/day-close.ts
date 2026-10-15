import type { DayClose, DayCloseMethod } from "@/features/counter/api";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

const SLIP_SEPARATOR = " - ";

// "QRIS - EDC BCA" is the QRIS line on the EDC BCA slip. A name without the
// separator is its own slip.
export const splitMethodName = (name: string) => {
	const at = name.lastIndexOf(SLIP_SEPARATOR);
	if (at < 0) {
		return { slip: name, line: name };
	}
	return {
		slip: name.slice(at + SLIP_SEPARATOR.length),
		line: name.slice(0, at),
	};
};

export interface MethodLine extends DayCloseMethod {
	line: string;
}

export interface SlipGroup {
	amount: number;
	// One line named like the slip shows as the slip row alone.
	isSingle: boolean;
	lines: MethodLine[];
	payments: number;
	slip: string;
}

export const groupBySlip = (methods: DayCloseMethod[]): SlipGroup[] => {
	const bySlip = new Map<string, MethodLine[]>();
	for (const method of methods) {
		const { slip, line } = splitMethodName(method.name);
		bySlip.set(slip, [...(bySlip.get(slip) ?? []), { ...method, line }]);
	}
	return [...bySlip.entries()].map(([slip, lines]) => ({
		slip,
		amount: lines.reduce((sum, line) => sum + line.amount, 0),
		payments: lines.reduce((sum, line) => sum + line.payments, 0),
		lines,
		isSingle: lines.length === 1 && lines[0].line === slip,
	}));
};

// is_paid is as of the day's close, so an Order paid the next day still counts
// here as money the day was owed.
export const unpaidOrdersOf = (data: DayClose) =>
	data.dropped_off.order_list.filter(
		(order) => !(order.is_paid || order.is_cancelled),
	);

export const DAY_SHORT = "D MMM";
export const DAY_LONG = "ddd, D MMM YYYY";

export const formatDayShort = (day: string) => dayjs(day).format(DAY_SHORT);

// "Today's Payments" on today, "12 Oct Payments" on a past day.
export const formatDayLabel = (day: string, today: string) =>
	day === today ? "Today's" : formatDayShort(day);

export const formatDayLong = (day: string) => dayjs(day).format(DAY_LONG);

export const formatClock = (iso: string) =>
	dayjs(iso).tz(JAKARTA_TZ).format("HH:mm");
