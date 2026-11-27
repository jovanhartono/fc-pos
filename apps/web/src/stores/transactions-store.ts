import { create } from "zustand";

import type { CategoryFilter } from "@/features/transactions/lib/transactions";

interface TransactionsPageUiState {
  searchTerm: string;
  activeCategory: CategoryFilter;
  submitError: string;
  // Drop-off photo captured in the POS before the Order exists; uploaded after
  // checkout commits. Kept here (not in the page context) so a photo pick only
  // re-renders the checkout field, not the whole catalog.
  dropoffPhoto: File | null;
  // Which Item card a catalog tap lands on (ADR-0017). The cashier works one
  // Item at a time — put the shoe down, sell it a clean, upsell a repaint — so
  // taps follow the Item on the counter. Never reaches the server.
  activeItemId: string | null;
  // One per cart, sent with Create Order: a tap repeated after a lost reply
  // gets the Order already saved instead of charging the Customer twice.
  orderRequestId: string;
}

interface TransactionsPageUiActions {
  setSearchTerm: (value: string) => void;
  setActiveCategory: (category: CategoryFilter) => void;
  setSubmitError: (message: string) => void;
  setDropoffPhoto: (file: File | null) => void;
  setActiveItemId: (itemId: string | null) => void;
  renewOrderRequestId: () => void;
  resetUi: () => void;
}

export type TransactionsPageStore = TransactionsPageUiState &
  TransactionsPageUiActions;

const createInitialUiState = (): TransactionsPageUiState => ({
  searchTerm: "",
  activeCategory: "all",
  submitError: "",
  dropoffPhoto: null,
  activeItemId: null,
  orderRequestId: crypto.randomUUID(),
});

export const useTransactionsPageStore = create<TransactionsPageStore>()(
  (set) => ({
    ...createInitialUiState(),
    setSearchTerm: (searchTerm) => set({ searchTerm }),
    setActiveCategory: (activeCategory) => set({ activeCategory }),
    setSubmitError: (submitError) => set({ submitError }),
    setDropoffPhoto: (dropoffPhoto) => set({ dropoffPhoto }),
    setActiveItemId: (activeItemId) => set({ activeItemId }),
    renewOrderRequestId: () => set({ orderRequestId: crypto.randomUUID() }),
    resetUi: () => set(createInitialUiState()),
  })
);
