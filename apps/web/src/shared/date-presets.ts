import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

const WIRE_FORMAT = "YYYY-MM-DD";

export function jakartaToday(): string {
	return dayjs().tz(JAKARTA_TZ).format(WIRE_FORMAT);
}

export type DatePreset =
	| "today"
	| "yesterday"
	| "thisWeek"
	| "lastWeek"
	| "thisMonth"
	| "lastMonth"
	| "7d"
	| "30d"
	| "90d";

export interface RangePreset {
	id: DatePreset;
	label: string;
	from: string;
	to: string;
}

export function getPresets(): RangePreset[] {
	const today = dayjs(jakartaToday());
	const yesterday = today.subtract(1, "day");
	// dayjs runs without the isoWeek plugin, so Monday is stepped back to by hand.
	const monday = today.subtract((today.day() + 6) % 7, "day");
	const lastMonday = monday.subtract(7, "day");
	const previousMonth = today.subtract(1, "month");

	return [
		{
			id: "today",
			label: "Today",
			from: today.format(WIRE_FORMAT),
			to: today.format(WIRE_FORMAT),
		},
		{
			id: "yesterday",
			label: "Yesterday",
			from: yesterday.format(WIRE_FORMAT),
			to: yesterday.format(WIRE_FORMAT),
		},
		{
			id: "thisWeek",
			label: "This week",
			from: monday.format(WIRE_FORMAT),
			to: today.format(WIRE_FORMAT),
		},
		{
			id: "lastWeek",
			label: "Last week",
			from: lastMonday.format(WIRE_FORMAT),
			to: lastMonday.add(6, "day").format(WIRE_FORMAT),
		},
		{
			id: "thisMonth",
			label: "This month",
			from: today.startOf("month").format(WIRE_FORMAT),
			to: today.format(WIRE_FORMAT),
		},
		{
			id: "lastMonth",
			label: "Last month",
			from: previousMonth.startOf("month").format(WIRE_FORMAT),
			to: previousMonth.endOf("month").format(WIRE_FORMAT),
		},
		{
			id: "7d",
			label: "Last 7 days",
			from: today.subtract(6, "day").format(WIRE_FORMAT),
			to: today.format(WIRE_FORMAT),
		},
		{
			id: "30d",
			label: "Last 30 days",
			from: today.subtract(29, "day").format(WIRE_FORMAT),
			to: today.format(WIRE_FORMAT),
		},
		{
			id: "90d",
			label: "Last 90 days",
			from: today.subtract(89, "day").format(WIRE_FORMAT),
			to: today.format(WIRE_FORMAT),
		},
	];
}

export function matchPreset(
	presets: RangePreset[],
	from: string,
	to: string,
): RangePreset | undefined {
	return presets.find((p) => p.from === from && p.to === to);
}
