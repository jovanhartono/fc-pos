import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

const WIRE_FORMAT = "YYYY-MM-DD";

export function jakartaToday(): string {
	return dayjs().tz(JAKARTA_TZ).format(WIRE_FORMAT);
}

export const DATE_PRESETS = [
	"today",
	"yesterday",
	"thisWeek",
	"lastWeek",
	"thisMonth",
	"lastMonth",
	"7d",
	"30d",
	"90d",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

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

export function getPreset(id: DatePreset): RangePreset {
	return getPresets().find((preset) => preset.id === id) as RangePreset;
}

// Two presets can share dates (This month and Today on the 1st), so the one
// the user tapped names the range when it still fits.
export function matchPreset(
	presets: RangePreset[],
	from: string,
	to: string,
	tapped?: DatePreset,
): RangePreset | undefined {
	const matches = presets.filter((p) => p.from === from && p.to === to);
	return matches.find((p) => p.id === tapped) ?? matches[0];
}
