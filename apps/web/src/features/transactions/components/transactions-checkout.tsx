import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	isCustomerReady,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { CheckoutCartStep } from "@/features/transactions/components/checkout-cart-step";
import {
	CheckoutFooter,
	type CheckoutStep,
} from "@/features/transactions/components/checkout-footer";
import { CheckoutPaymentStep } from "@/features/transactions/components/checkout-payment-step";
import { cn } from "@/lib/utils";

// Two-step POS checkout: Cart → Payment. Body scrolls; the total + primary
// action live in a pinned footer so they stay reachable on the iPad sheet. Step
// is local state and resets to "cart" each time the sheet remounts on open.
export const TransactionsCheckout = () => {
	const { resetCart, count } = useCart();
	const [step, setStep] = useState<CheckoutStep>("cart");
	const [customerName = "", customerPhone = "", selectedCampaignIds = []] =
		useWatch<
			TransactionDraftValues,
			["customerName", "customerPhone", "selectedCampaignIds"]
		>({ name: ["customerName", "customerPhone", "selectedCampaignIds"] });

	// Same gate as the footer's Continue button — the step tabs are a second way
	// to reach Payment, so they must enforce it too, or a cashier could jump
	// ahead with an empty customer and hit a Create Order that fails validation
	// silently (the errors live on the Cart step they skipped).
	const customerReady = isCustomerReady(customerName, customerPhone);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<SheetHeader className="flex-row items-center justify-between gap-3 border-b border-border/70">
				<SheetTitle className="sr-only">Cart</SheetTitle>
				<SheetDescription className="sr-only">
					Review cart lines, shoe details, and totals before checkout.
				</SheetDescription>
				<div className="inline-flex gap-1 border border-border/70 bg-background/80 p-1">
					<button
						type="button"
						className={cn(
							"flex h-8 items-center justify-center border px-4 text-xs font-medium outline-none transition focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
							step === "cart"
								? "border-foreground bg-foreground text-background"
								: "border-transparent text-foreground/60 hover:bg-muted/40",
						)}
						onClick={() => setStep("cart")}
					>
						Cart
					</button>
					<button
						type="button"
						disabled={count === 0 || !customerReady}
						className={cn(
							"flex h-8 items-center justify-center border px-4 text-xs font-medium outline-none transition focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
							step === "payment"
								? "border-foreground bg-foreground text-background"
								: "border-transparent text-foreground/60 hover:bg-muted/40",
						)}
						onClick={() => setStep("payment")}
					>
						Payment
					</button>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-9"
					onClick={resetCart}
					disabled={
						count === 0 &&
						!customerName &&
						!customerPhone &&
						selectedCampaignIds.length === 0
					}
					icon={<TrashIcon className="size-4" />}
				>
					Reset
				</Button>
			</SheetHeader>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="grid gap-5 p-4">
					<div
						key={step}
						className={cn(
							"animate-in fade-in duration-150",
							step === "cart"
								? "slide-in-from-left-2"
								: "slide-in-from-right-2",
						)}
					>
						{step === "cart" ? <CheckoutCartStep /> : <CheckoutPaymentStep />}
					</div>
				</div>
			</div>

			<CheckoutFooter
				step={step}
				onContinue={() => setStep("payment")}
				onBack={() => setStep("cart")}
			/>
		</div>
	);
};
