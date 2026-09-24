import type { ReportGranularity } from "@/features/reports/api";
import dayjs from "@/lib/dayjs";
import {
	type DatePreset,
	getPresets,
	jakartaToday,
	matchPreset,
} from "@/shared/date-presets";

export function defaultRange(): { from: string; to: string } {
	const today = dayjs(jakartaToday());
	return {
		from: today.subtract(29, "day").format("YYYY-MM-DD"),
		to: today.format("YYYY-MM-DD"),
	};
}

interface ReportFilterValues {
	from: string;
	to: string;
	store_id?: number;
	granularity?: ReportGranularity;
}

export interface SavedReportFilters {
	preset?: DatePreset;
	from?: string;
	to?: string;
	storeId?: number;
	granularity?: ReportGranularity;
}

// Saved as the preset, not its dates, so a manager who reads "This month" every
// morning still gets this month once the calendar turns. On the 1st it shares
// Today's dates, so the preset already saved wins, then the default Last 30 days.
export function toSavedReportFilters(
	{ from, to, store_id, granularity }: ReportFilterValues,
	saved: SavedReportFilters | undefined,
): SavedReportFilters {
	const presets = getPresets();
	const preset =
		presets.find(
			(candidate) =>
				(candidate.id === saved?.preset || candidate.id === "30d") &&
				candidate.from === from &&
				candidate.to === to,
		) ?? matchPreset(presets, from, to);
	const range = preset ? { preset: preset.id } : { from, to };
	return { ...range, storeId: store_id, granularity };
}

// Every in-app move keeps the range in the URL, so a URL without one is an
// arrival from the sidebar or a bare link: fill the gaps from what was saved.
export function withSavedReportFilters(
	search: Record<string, unknown>,
	saved: SavedReportFilters | undefined,
): Record<string, unknown> {
	if (!saved || search.from !== undefined || search.to !== undefined) {
		return search;
	}

	const preset = getPresets().find(({ id }) => id === saved.preset);
	return {
		from: preset?.from ?? saved.from,
		to: preset?.to ?? saved.to,
		store_id: saved.storeId,
		granularity: saved.granularity,
		...search,
	};
}
