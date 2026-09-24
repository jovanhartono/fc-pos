import type { ReportGranularity } from "@/features/reports/api";
import { type DatePreset, getPreset } from "@/shared/date-presets";

export const DEFAULT_PRESET: DatePreset = "30d";

export interface ReportFilterValues {
	preset?: DatePreset;
	from?: string;
	to?: string;
	store_id?: number;
	granularity?: ReportGranularity;
}

// A tapped preset is kept by name, not by its dates, so an admin who reads
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
	const { from, to } = search;
	if (!search.preset && from && to) {
		return { ...search, from, to };
	}
	// An admin who never picked a range reads Last 30 days, and still does
	// tomorrow after changing only the Store.
	const preset = getPreset(search.preset ?? DEFAULT_PRESET);
	return { ...search, preset: preset.id, from: preset.from, to: preset.to };
}

// Dates the admin picked on the calendar are saved as dates, so they are shown
// as dates even on a day they match a preset.
export function rangeLabel({ preset, from, to }: ReportFilterValues): string {
	return preset ? getPreset(preset).label : `${from} → ${to}`;
}

// Overview and Aging Queue show only the Store, so their Reset leaves the range
// and granularity the other tabs read.
export function resetReportFilters(showsRange: boolean): ReportFilterValues {
	return showsRange
		? { preset: DEFAULT_PRESET, store_id: undefined, granularity: undefined }
		: { store_id: undefined };
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
