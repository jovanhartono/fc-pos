import { create } from "zustand";
import { persist } from "zustand/middleware";

type TransactionPreferencesStore = {
	selectedStoreIdByUser: Record<string, string>;
	setSelectedStoreId: (userKey: string, storeId: string) => void;
	clearSelectedStoreId: (userKey: string) => void;
};

export const useTransactionPreferencesStore =
	create<TransactionPreferencesStore>()(
		persist(
			(set) => ({
				selectedStoreIdByUser: {},
				setSelectedStoreId: (userKey, storeId) =>
					set((state) => ({
						selectedStoreIdByUser: {
							...state.selectedStoreIdByUser,
							[userKey]: storeId,
						},
					})),
				clearSelectedStoreId: (userKey) =>
					set((state) => {
						const nextSelectedStoreIdByUser = {
							...state.selectedStoreIdByUser,
						};
						delete nextSelectedStoreIdByUser[userKey];

						return {
							selectedStoreIdByUser: nextSelectedStoreIdByUser,
						};
					}),
			}),
			{
				name: "transaction-preferences",
				// Which branch a till defaults to. Change the shape of
				// selectedStoreIdByUser and you must bump this and add `migrate`, or
				// zustand hands the new code the old shape and the POS quietly opens
				// on the wrong store. Bumping it on its own is not free: with no
				// migrate, zustand discards the stored state, so every device forgets
				// its store once.
				version: 0,
			},
		),
	);
