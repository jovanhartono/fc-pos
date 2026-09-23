import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QueueCategoryMode } from "@/features/orders/api";

interface QueueCategoryPreference {
	categoryId: number;
	mode: QueueCategoryMode;
}

type QueuePreferencesStore = {
	storeIdByUser: Record<string, number>;
	setStoreId: (userKey: string, storeId: number) => void;
	categoryByUser: Record<string, QueueCategoryPreference | undefined>;
	setCategory: (userKey: string, category?: QueueCategoryPreference) => void;
};

// Which branch's rack a worker last looked at. The queue reads its store from
// the URL, so leaving the page and coming back through the sidebar arrived
// with no store and reset the filter every time.
export const useQueuePreferencesStore = create<QueuePreferencesStore>()(
	persist(
		(set) => ({
			storeIdByUser: {},
			setStoreId: (userKey, storeId) =>
				set((state) => ({
					storeIdByUser: { ...state.storeIdByUser, [userKey]: storeId },
				})),
			// The artisan stands at the Repair rack every day, the cleaners at
			// everything else, so each worker's Category split is theirs to keep.
			categoryByUser: {},
			setCategory: (userKey, category) =>
				set((state) => ({
					categoryByUser: { ...state.categoryByUser, [userKey]: category },
				})),
		}),
		{
			name: "queue-preferences",
			// Which Store's rack the queue reopens on. Change storeIdByUser's
			// shape and you must bump this and add `migrate`, or every device
			// forgets its Store once.
			version: 0,
		},
	),
);
