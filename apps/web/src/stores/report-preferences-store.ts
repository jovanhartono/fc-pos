import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReportFilterValues } from "@/features/reports/utils/report-filters";

interface ReportPreferencesStore {
	filtersByUser: Record<string, ReportFilterValues | undefined>;
	setFilters: (userKey: string, filters: ReportFilterValues) => void;
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
			// Change ReportFilterValues' shape and you must bump this and add
			// `migrate`, or every device forgets its Reports filters once.
			version: 1,
			// Version 0 was never released and saved the Store as storeId.
			migrate: () => ({ filtersByUser: {} }),
		},
	),
);
