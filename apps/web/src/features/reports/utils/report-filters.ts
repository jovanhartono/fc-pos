import dayjs from "dayjs";

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Jakarta",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

export function jakartaToday(): string {
	return jakartaDateFormatter.format(new Date());
}

export type DatePreset =
	| "today"
	| "yesterday"
	| "7d"
	| "30d"
	| "90d"
	| "mtd"
	| "qtd";

export interface RangePreset {
	id: DatePreset;
	label: string;
	from: string;
	to: string;
}

export function getPresets(): RangePreset[] {
	const todayStr = jakartaToday();
	const today = dayjs(todayStr);
	const yesterday = today.subtract(1, "day");
	const startOfMonth = today.startOf("month");
	const currentQuarter = Math.floor(today.month() / 3);
	const startOfQuarter = today.month(currentQuarter * 3).startOf("month");

	return [
		{
			id: "today",
			label: "Today",
			from: today.format("YYYY-MM-DD"),
			to: today.format("YYYY-MM-DD"),
		},
		{
			id: "yesterday",
			label: "Yesterday",
			from: yesterday.format("YYYY-MM-DD"),
			to: yesterday.format("YYYY-MM-DD"),
		},
		{
			id: "7d",
			label: "Last 7 days",
			from: today.subtract(6, "day").format("YYYY-MM-DD"),
			to: today.format("YYYY-MM-DD"),
		},
		{
			id: "30d",
			label: "Last 30 days",
			from: today.subtract(29, "day").format("YYYY-MM-DD"),
			to: today.format("YYYY-MM-DD"),
		},
		{
			id: "90d",
			label: "Last 90 days",
			from: today.subtract(89, "day").format("YYYY-MM-DD"),
			to: today.format("YYYY-MM-DD"),
		},
		{
			id: "mtd",
			label: "Month to date",
			from: startOfMonth.format("YYYY-MM-DD"),
			to: today.format("YYYY-MM-DD"),
		},
		{
			id: "qtd",
			label: "Quarter to date",
			from: startOfQuarter.format("YYYY-MM-DD"),
			to: today.format("YYYY-MM-DD"),
		},
	];
}

export function matchPreset(
	presets: RangePreset[],
	from: string,
	to: string,
): DatePreset | undefined {
	return presets.find((p) => p.from === from && p.to === to)?.id;
}

export function defaultRange(): { from: string; to: string } {
	const today = dayjs(jakartaToday());
	return {
		from: today.subtract(29, "day").format("YYYY-MM-DD"),
		to: today.format("YYYY-MM-DD"),
	};
}
