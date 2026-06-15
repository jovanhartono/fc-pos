import { create } from "zustand";
import type {
	CatalogMode,
	CategoryFilter,
} from "@/features/transactions/lib/transactions";

type TransactionsPageUiState = {
	mode: CatalogMode;
	searchTerm: string;
	activeProductCategory: CategoryFilter;
	activeServiceCategory: CategoryFilter;
	submitError: string;
	// Drop-off photo captured in the POS before the Order exists; uploaded after
	// checkout commits. Kept here (not in the page context) so a photo pick only
	// re-renders the checkout field, not the whole catalog.
	dropoffPhoto: File | null;
};

type TransactionsPageUiActions = {
	setMode: (mode: CatalogMode) => void;
	setSearchTerm: (value: string) => void;
	setActiveProductCategory: (category: CategoryFilter) => void;
	setActiveServiceCategory: (category: CategoryFilter) => void;
	setSubmitError: (message: string) => void;
	setDropoffPhoto: (file: File | null) => void;
	resetUi: () => void;
};

export type TransactionsPageStore = TransactionsPageUiState &
	TransactionsPageUiActions;

const initialUiState: TransactionsPageUiState = {
	mode: "services",
	searchTerm: "",
	activeProductCategory: "all",
	activeServiceCategory: "all",
	submitError: "",
	dropoffPhoto: null,
};

export const useTransactionsPageStore = create<TransactionsPageStore>()(
	(set) => ({
		...initialUiState,
		setMode: (mode) => set({ mode }),
		setSearchTerm: (searchTerm) => set({ searchTerm }),
		setActiveProductCategory: (activeProductCategory) =>
			set({ activeProductCategory }),
		setActiveServiceCategory: (activeServiceCategory) =>
			set({ activeServiceCategory }),
		setSubmitError: (submitError) => set({ submitError }),
		setDropoffPhoto: (dropoffPhoto) => set({ dropoffPhoto }),
		resetUi: () => set(initialUiState),
	}),
);
