import { useEffect, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { CartMiniBar } from "@/features/transactions/components/cart-mini-bar";
import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";
import { useIsDesktop } from "@/hooks/use-is-desktop";

export function TransactionsWorkspace() {
	const isDesktop = useIsDesktop();
	const [cartSheetOpen, setCartSheetOpen] = useState(false);

	useEffect(() => {
		if (isDesktop) {
			setCartSheetOpen(false);
		}
	}, [isDesktop]);

	if (isDesktop) {
		return (
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(360px,0.82fr)]">
				<TransactionsCatalog />
				<TransactionsCheckout />
			</div>
		);
	}

	return (
		<>
			<div className="grid gap-6">
				<TransactionsCatalog />
				<CartMiniBar onOpen={() => setCartSheetOpen(true)} />
			</div>
			<Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
				<SheetContent
					side="bottom"
					className="max-h-[92dvh] overflow-y-auto"
					showCloseButton={false}
				>
					<SheetHeader className="sr-only">
						<SheetTitle>Cart</SheetTitle>
						<SheetDescription>
							Review cart lines, shoe details, and totals before checkout.
						</SheetDescription>
					</SheetHeader>
					<TransactionsCheckout isInSheet />
				</SheetContent>
			</Sheet>
		</>
	);
}
