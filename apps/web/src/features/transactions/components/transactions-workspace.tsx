import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CartColumn } from "@/features/transactions/components/cart-column";
import { CartMiniBar } from "@/features/transactions/components/cart-mini-bar";
import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const CART_COLUMN_MIN_WIDTH = 1024;

export function TransactionsWorkspace() {
	const [cartSheetOpen, setCartSheetOpen] = useState(false);
	const hasCartColumn = !useIsMobile(CART_COLUMN_MIN_WIDTH);
	const form = useFormContext<TransactionDraftValues>();
	const selectedStoreId =
		useWatch({ control: form.control, name: "selectedStoreId" }) ?? "";

	// The store scopes everything the checkout reads — campaigns, vouchers, the
	// order itself — so a storeless checkout can only end in a rejected submit.
	// Block it at the door: triggering the field raises the picker's own
	// FieldError up in the catalog, in place of the "Select a store" hint.
	const handleOpenCart = () => {
		if (!selectedStoreId) {
			void form.trigger("selectedStoreId");
			return;
		}
		setCartSheetOpen(true);
	};

	return (
		<>
			<div
				className={cn(
					"grid min-w-0 gap-6",
					hasCartColumn && "grid-cols-[minmax(0,1fr)_340px] items-start",
				)}
			>
				<TransactionsCatalog />
				{hasCartColumn ? (
					<CartColumn onOpen={handleOpenCart} />
				) : (
					<CartMiniBar onOpen={handleOpenCart} />
				)}
			</div>
			<Sheet onOpenChange={setCartSheetOpen} open={cartSheetOpen}>
				{/* Bottom at every width, never a right drawer: the item rows lay their
				    descriptor fields out in two columns and the stepper needs the room,
				    and a right sheet caps at max-w-sm. */}
				<SheetContent
					className="data-[side=bottom]:h-[92dvh]"
					showCloseButton={false}
					side="bottom"
				>
					<TransactionsCheckout />
				</SheetContent>
			</Sheet>
		</>
	);
}
