import { create } from "zustand";
import type {
	CatalogMode,
	CategoryFilter,
} from "@/features/transactions/lib/transactions";
import type { ResolvedVoucher } from "@/lib/api";

interface VoucherEntry {
	code: string;
	campaign: ResolvedVoucher;
}

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
	// Voucher codes the cashier has resolved (validated + previewed) but not yet
	// committed. The code string rides in the checkout payload's voucher_codes;
	// the campaign shape feeds the checkout pricing preview.
	resolvedVoucherEntries: VoucherEntry[];
};

type TransactionsPageUiActions = {
	setMode: (mode: CatalogMode) => void;
	setSearchTerm: (value: string) => void;
	setActiveProductCategory: (category: CategoryFilter) => void;
	setActiveServiceCategory: (category: CategoryFilter) => void;
	setSubmitError: (message: string) => void;
	setDropoffPhoto: (file: File | null) => void;
	addResolvedVoucher: (code: string, campaign: ResolvedVoucher) => void;
	removeResolvedVoucher: (code: string) => void;
	clearResolvedVouchers: () => void;
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
	resolvedVoucherEntries: [],
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
		addResolvedVoucher: (code, campaign) =>
			set((s) => ({
				// One voucher per campaign per order (the server enforces the same via
				// order_campaigns' unique constraint): drop any existing entry for this
				// code OR this campaign before adding, so the same campaign can't be
				// applied twice and double-count in the price preview.
				resolvedVoucherEntries: [
					...s.resolvedVoucherEntries.filter(
						(e) => e.code !== code && e.campaign.id !== campaign.id,
					),
					{ code, campaign },
				],
			})),
		removeResolvedVoucher: (code) =>
			set((s) => ({
				resolvedVoucherEntries: s.resolvedVoucherEntries.filter(
					(e) => e.code !== code,
				),
			})),
		clearResolvedVouchers: () => set({ resolvedVoucherEntries: [] }),
		resetUi: () => set(initialUiState),
	}),
);
