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
};

type TransactionsPageUiActions = {
	setMode: (mode: CatalogMode) => void;
	setSearchTerm: (value: string) => void;
	setActiveProductCategory: (category: CategoryFilter) => void;
	setActiveServiceCategory: (category: CategoryFilter) => void;
	setSubmitError: (message: string) => void;
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
		resetUi: () => set(initialUiState),
	}),
);
