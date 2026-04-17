import { createContext, type ReactNode, use } from "react";
import type { Store } from "@/lib/api";

export type TransactionsPageContextValue = {
	isAdmin: boolean;
	visibleStores: Store[];
	submit: () => void;
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
