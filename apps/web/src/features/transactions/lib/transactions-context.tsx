import { createContext, type ReactNode, use } from "react";
import type { CheckoutIssue } from "@/features/transactions/lib/checkout-issues";
import type { Store } from "@/lib/api";

export type TransactionsPageContextValue = {
	isAdmin: boolean;
	visibleStores: Store[];
	// Resolves to what blocked the checkout — empty once the Order is created.
	submit: () => Promise<CheckoutIssue[]>;
	handleStoreChange: (value: string) => void;
};

const TransactionsPageContext =
	createContext<TransactionsPageContextValue | null>(null);

export function TransactionsPageProvider({
	value,
	children,
}: {
	value: TransactionsPageContextValue;
	children: ReactNode;
}) {
	return (
		<TransactionsPageContext value={value}>{children}</TransactionsPageContext>
	);
}

export function useTransactionsPageContext() {
	const value = use(TransactionsPageContext);
	if (!value) {
		throw new Error(
			"useTransactionsPageContext must be used within TransactionsPageProvider",
		);
	}
	return value;
}
