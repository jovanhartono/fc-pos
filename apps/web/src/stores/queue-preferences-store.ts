import { create } from "zustand";
import { persist } from "zustand/middleware";

type QueuePreferencesStore = {
	storeIdByUser: Record<string, number>;
	setStoreId: (userKey: string, storeId: number) => void;
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
		}),
		{ name: "queue-preferences" },
	),
);
