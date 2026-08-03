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

	// The store scopes everything the checkout reads — campaigns, vouchers, the
	// order itself — so a storeless checkout can only end in a rejected submit.
	// Block it at the door: the mini bar's hint says why, and triggering the field
	// raises the picker's own FieldError up in the catalog.
	const handleOpenCart = () => {
		if (!selectedStoreId) {
			void form.trigger("selectedStoreId");
			return;
		}
		setCartSheetOpen(true);
	};

	return (
		<>
			<div className="grid gap-6">
				<TransactionsCatalog />
				<CartMiniBar hasStore={!!selectedStoreId} onOpen={handleOpenCart} />
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
