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
			},
		),
	);
