import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CartMiniBar } from "@/features/transactions/components/cart-mini-bar";
import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";

export function TransactionsWorkspace() {
	const [cartSheetOpen, setCartSheetOpen] = useState(false);

	return (
		<>
			<div className="grid gap-6">
				<TransactionsCatalog />
				<CartMiniBar onOpen={() => setCartSheetOpen(true)} />
			</div>
			<Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
				<SheetContent
					side="bottom"
					className="data-[side=bottom]:h-[92dvh]"
					showCloseButton={false}
				>
					<TransactionsCheckout />
				</SheetContent>
			</Sheet>
		</>
	);
}
