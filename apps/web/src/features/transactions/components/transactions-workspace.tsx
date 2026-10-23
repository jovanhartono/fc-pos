import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CartMiniBar } from "@/features/transactions/components/cart-mini-bar";
import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";

export function TransactionsWorkspace() {
	const [cartSheetOpen, setCartSheetOpen] = useState(false);
	const form = useFormContext<TransactionDraftValues>();
	const selectedStoreId =
		useWatch({ control: form.control, name: "selectedStoreId" }) ?? "";

	// Checkout without a Store can only fail, so the picker shows its error and
	// scrolls back into view for a cashier scrolled down the catalog.
	const handleOpenCart = () => {
		if (!selectedStoreId) {
			void form.trigger("selectedStoreId");
			document
				.getElementById("order-store")
				?.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}
		setCartSheetOpen(true);
	};

	return (
		<>
			<div className="grid min-w-0 gap-6">
				<TransactionsCatalog />
				<CartMiniBar onOpen={handleOpenCart} />
			</div>
			{/* Bottom at every width: the Item fields' two columns and the stepper
			    don't fit a right sheet, which caps at max-w-sm. */}
			<Sheet onOpenChange={setCartSheetOpen} open={cartSheetOpen} side="bottom">
				<SheetContent
					className="data-[side=bottom]:h-[92dvh]"
					showCloseButton={false}
				>
					<TransactionsCheckout />
				</SheetContent>
			</Sheet>
		</>
	);
}
