import { createContext, use } from "react";
import type { ReactNode } from "react";

import type { Store } from "@/features/stores/api";

export interface TransactionsPageContextValue {
  isAdmin: boolean;
  visibleStores: Store[];
  submit: () => Promise<void>;
  handleStoreChange: (value: string) => void;
}

const TransactionsPageContext =
  createContext<TransactionsPageContextValue | null>(null);

export const TransactionsPageProvider = ({
  value,
  children,
}: {
  value: TransactionsPageContextValue;
  children: ReactNode;
}) => (
  <TransactionsPageContext value={value}>{children}</TransactionsPageContext>
);

export const useTransactionsPageContext = () => {
  const value = use(TransactionsPageContext);
  if (!value) {
    throw new Error(
      "useTransactionsPageContext must be used within TransactionsPageProvider"
    );
  }
  return value;
};
