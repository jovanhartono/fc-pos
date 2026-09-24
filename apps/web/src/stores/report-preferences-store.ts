import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SavedReportFilters } from "@/features/reports/utils/report-filters";

interface ReportPreferencesStore {
	filtersByUser: Record<string, SavedReportFilters | undefined>;
	setFilters: (userKey: string, filters: SavedReportFilters) => void;
}

// The range, Store and granularity an admin last read Reports with. They live
// in the URL, so coming back through the sidebar reset them every time.
export const useReportPreferencesStore = create<ReportPreferencesStore>()(
	persist(
		(set) => ({
			filtersByUser: {},
			setFilters: (userKey, filters) =>
				set((state) => ({
					filtersByUser: { ...state.filtersByUser, [userKey]: filters },
				})),
		}),
		{
			name: "report-preferences",
			// Change SavedReportFilters' shape and you must bump this and add
			// `migrate`, or every device forgets its Reports filters once.
			version: 0,
		},
	),
);
