import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CartMiniBar } from "@/features/transactions/components/cart-mini-bar";
import { TransactionsCatalog } from "@/features/transactions/components/transactions-catalog";
import { TransactionsCheckout } from "@/features/transactions/components/transactions-checkout";
import { focusStoreField } from "@/features/transactions/lib/transactions";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";

export function TransactionsWorkspace() {
	const [cartSheetOpen, setCartSheetOpen] = useState(false);
	const { isAdmin, visibleStores } = useTransactionsPageContext();
	const form = useFormContext<TransactionDraftValues>();
	const selectedStoreId =
		useWatch({ control: form.control, name: "selectedStoreId" }) ?? "";

	// The store scopes everything the checkout reads — campaigns, vouchers, the
	// order itself — so a storeless checkout can only end in a rejected submit.
	// Block it at the door instead, and send the cashier to the picker: it sits in
	// the catalog this sheet would cover, scrolled off the top on a phone.
	const handleOpenCart = () => {
		if (!selectedStoreId) {
			// A staff account with no store assigned lands here with an empty, disabled
			// picker — offering "Select store" would point at a control they can't use.
			if (!isAdmin && visibleStores.length === 0) {
				toast.error("No store assigned to your account", {
					description: "Ask an admin to assign one.",
				});
				return;
			}
			void form.trigger("selectedStoreId");
			// Only the admin's picker is enabled — for staff it is auto-filled and
			// disabled, so focusing it would do nothing.
			toast.error("Select a store first", {
				action: isAdmin
					? { label: "Select store", onClick: focusStoreField }
					: undefined,
			});
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
