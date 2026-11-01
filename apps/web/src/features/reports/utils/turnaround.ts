import { oneDecimalFormatter } from "@/features/reports/utils/format";
import dayjs from "@/lib/dayjs";

const HOURS_PER_DAY = 24;
const MIN_AXIS_DAYS = 3;

// Chart and table: "22h" under two days, then "6,9d".
export const shortDuration = (hours: number) =>
	hours < 48
		? `${Math.round(hours)}h`
		: `${oneDecimalFormatter.format(hours / HOURS_PER_DAY)}d`;

// KPI, definition line, tooltip, breakdown: "22 hours" / "6,9 days".
export const longDuration = (hours: number) =>
	hours < 48
		? `${Math.round(hours)} hours`
		: `${oneDecimalFormatter.format(hours / HOURS_PER_DAY)} days`;

export const shortDay = (day: string) => dayjs(day).format("D MMM");

// The same Item lands on the same height on every render.
export const jitter = (index: number) => {
	const x = Math.sin(index * 12.9898) * 43_758.5453;
	return x - Math.floor(x);
};

// Sized to the row's p99 so one slow Repair cannot squash every other dot;
// slower Items pin to the right edge.
export const axisMaxHours = (p99: number | null, itemHours: number[]) => {
	const top = p99 === null ? Math.max(0, ...itemHours) : p99 * 1.25;
	return (
		Math.max(MIN_AXIS_DAYS, Math.ceil(top / HOURS_PER_DAY)) * HOURS_PER_DAY
	);
};

export const dayTickHours = (maxHours: number) => {
	const days = maxHours / HOURS_PER_DAY;
	let step = 5;
	if (days <= 8) {
		step = 1;
	} else if (days <= 16) {
		step = 2;
	}
	const ticks: number[] = [];
	for (let day = 0; day <= days; day += step) {
		ticks.push(day * HOURS_PER_DAY);
	}
	return ticks;
};

export const rowOrAll = <T extends { name: string }>(
	rows: T[],
	name: string | null,
) => rows.find((row) => row.name === name) ?? rows[0];
