import type { DayCloseMethod } from "@/features/counter/api";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

export const NO_PAYMENT_METHOD = "No PaymentMethod";

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

// Groups follow the order the server sent the methods in.
export const groupBySlip = (methods: DayCloseMethod[]): SlipGroup[] => {
	const groups = new Map<string, SlipGroup>();
	for (const method of methods) {
		const { slip, line } = splitMethodName(method.name);
		const group = groups.get(slip) ?? {
			slip,
			amount: 0,
			payments: 0,
			lines: [],
			isSingle: false,
		};
		group.amount += method.amount;
		group.payments += method.payments;
		group.lines.push({ ...method, line });
		groups.set(slip, group);
	}
	return [...groups.values()].map((group) => ({
		...group,
		isSingle: group.lines.length === 1 && group.lines[0].line === group.slip,
	}));
};

export const formatDayShort = (day: string) => dayjs(day).format("D MMM");

export const formatDayLong = (day: string) =>
	dayjs(day).format("ddd, D MMM YYYY");

export const formatClock = (iso: string) =>
	dayjs(iso).tz(JAKARTA_TZ).format("HH:mm");
