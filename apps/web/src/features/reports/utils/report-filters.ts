import type { ReportGranularity } from "@/features/reports/api";
import dayjs from "@/lib/dayjs";
import {
	type DatePreset,
	getPresets,
	jakartaToday,
} from "@/shared/date-presets";

export function defaultRange(): { from: string; to: string } {
	const today = dayjs(jakartaToday());
	return {
		from: today.subtract(29, "day").format("YYYY-MM-DD"),
		to: today.format("YYYY-MM-DD"),
	};
}

export interface ReportFilterValues {
	preset?: DatePreset;
	from?: string;
	to?: string;
	store_id?: number;
	granularity?: ReportGranularity;
}

// A tapped preset is kept by name, not by its dates, so a manager who reads
// "Last 7 days" every morning still gets the last 7 days tomorrow.
export function toReportFilters({
	preset,
	from,
	to,
	store_id,
	granularity,
}: ReportFilterValues): ReportFilterValues {
	const range = preset ? { preset } : { from, to };
	return { ...range, store_id, granularity };
}

export function withPresetRange<T extends ReportFilterValues>(search: T) {
	const preset = getPresets().find(({ id }) => id === search.preset);
	if (preset) {
		return { ...search, from: preset.from, to: preset.to };
	}
	if (search.from && search.to) {
		return { ...search, from: search.from, to: search.to };
	}
	// A manager who never picked a range reads Last 30 days, and still does
	// tomorrow after changing only the Store.
	return { ...search, preset: "30d" as const, ...defaultRange() };
}

const FILTER_KEYS: (keyof ReportFilterValues)[] = [
	"preset",
	"from",
	"to",
	"store_id",
	"granularity",
];

// Every in-app move keeps the filters in the URL, so a URL without any is an
// arrival from the sidebar or a bare link: show what this admin last read.
export function withSavedReportFilters<T extends ReportFilterValues>(
	search: T,
	saved: ReportFilterValues | undefined,
): T {
	if (!saved || FILTER_KEYS.some((key) => search[key] !== undefined)) {
		return search;
	}
	return { ...search, ...saved };
}
