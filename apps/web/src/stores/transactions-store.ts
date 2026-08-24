import { create } from "zustand";
import type { CategoryFilter } from "@/features/transactions/lib/transactions";

type TransactionsPageUiState = {
	searchTerm: string;
	activeCategory: CategoryFilter;
	submitError: string;
	// Drop-off photo captured in the POS before the Order exists; uploaded after
	// checkout commits. Kept here (not in the page context) so a photo pick only
	// re-renders the checkout field, not the whole catalog.
	dropoffPhoto: File | null;
};

type TransactionsPageUiActions = {
	setSearchTerm: (value: string) => void;
	setActiveCategory: (category: CategoryFilter) => void;
	setSubmitError: (message: string) => void;
	setDropoffPhoto: (file: File | null) => void;
	resetUi: () => void;
};

export type TransactionsPageStore = TransactionsPageUiState &
	TransactionsPageUiActions;

const initialUiState: TransactionsPageUiState = {
	searchTerm: "",
	activeCategory: "all",
	submitError: "",
	dropoffPhoto: null,
};

export const useTransactionsPageStore = create<TransactionsPageStore>()(
	(set) => ({
		...initialUiState,
		setSearchTerm: (searchTerm) => set({ searchTerm }),
		setActiveCategory: (activeCategory) => set({ activeCategory }),
		setSubmitError: (submitError) => set({ submitError }),
		setDropoffPhoto: (dropoffPhoto) => set({ dropoffPhoto }),
		resetUi: () => set(initialUiState),
	}),
);
