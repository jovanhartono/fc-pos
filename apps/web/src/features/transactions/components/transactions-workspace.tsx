import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CartMiniBar } from "@/features/transactions/components/cart-mini-bar";
import { CartRail } from "@/features/transactions/components/cart-rail";
import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";
import { useIsMobile } from "@/hooks/use-mobile";

export function TransactionsWorkspace() {
	const [cartSheetOpen, setCartSheetOpen] = useState(false);
	const form = useFormContext<TransactionDraftValues>();
	const selectedStoreId =
		useWatch({ control: form.control, name: "selectedStoreId" }) ?? "";
	// Same 1280 boundary the cart rail uses: where the rail is standing, the
	// checkout comes in from the side so the catalog it used to bury stays on
	// screen. Below that the bottom sheet is the right pattern and keeps it.
	const isNarrow = useIsMobile(1280);

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
			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="grid min-w-0 gap-6">
					<TransactionsCatalog />
					<CartMiniBar hasStore={!!selectedStoreId} onOpen={handleOpenCart} />
				</div>
				<CartRail hasStore={!!selectedStoreId} onCheckout={handleOpenCart} />
			</div>
			<Sheet onOpenChange={setCartSheetOpen} open={cartSheetOpen}>
				<SheetContent
					className="data-[side=bottom]:h-[92dvh]"
					showCloseButton={false}
					side={isNarrow ? "bottom" : "right"}
				>
					<TransactionsCheckout />
				</SheetContent>
			</Sheet>
		</>
	);
}
