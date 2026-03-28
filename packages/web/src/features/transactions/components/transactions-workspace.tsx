import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";

export function TransactionsWorkspace() {
	return (
		<div className="grid gap-6 md:grid-cols-[minmax(0,1.9fr)_minmax(360px,0.82fr)]">
			<TransactionsCatalog />
			<TransactionsCheckout />
		</div>
	);
}
