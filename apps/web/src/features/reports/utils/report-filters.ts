import type { ReportGranularity } from "@/features/reports/api";
import dayjs from "@/lib/dayjs";
import {
	type DatePreset,
	getPresets,
	jakartaToday,
	matchPreset,
	type RangePreset,
} from "@/shared/date-presets";

export function defaultRange(): { from: string; to: string } {
	const today = dayjs(jakartaToday());
	return {
		from: today.subtract(29, "day").format("YYYY-MM-DD"),
		to: today.format("YYYY-MM-DD"),
	};
}

export interface ReportFilterValues {
	from: string;
	to: string;
	store_id?: number;
	granularity?: ReportGranularity;
}

export interface SavedReportFilters {
	range: { preset: DatePreset } | { from: string; to: string };
	storeId?: number;
	granularity?: ReportGranularity;
}

// "This month" is saved as the preset, not its dates, so a manager who reads
// it every morning still gets this month once the calendar turns.
export function toSavedReportFilters(
	filters: ReportFilterValues,
	presets: RangePreset[] = getPresets(),
): SavedReportFilters {
	const preset = matchPreset(presets, filters.from, filters.to);
	return {
		range: preset
			? { preset: preset.id }
			: { from: filters.from, to: filters.to },
		storeId: filters.store_id,
		granularity: filters.granularity,
	};
}

// Every in-app move keeps the range in the URL, so a URL without one is an
// arrival from the sidebar or a bare link: fill the gaps from what was saved.
export function withSavedReportFilters(
	search: Record<string, unknown>,
	saved: SavedReportFilters | undefined,
	presets: RangePreset[] = getPresets(),
): Record<string, unknown> {
	if (!saved || search.from !== undefined || search.to !== undefined) {
		return search;
	}

	const { range } = saved;
	const { from, to } =
		"preset" in range
			? (presets.find((preset) => preset.id === range.preset) ?? defaultRange())
			: range;

	return {
		from,
		to,
		store_id: saved.storeId,
		granularity: saved.granularity,
		...search,
	};
}
