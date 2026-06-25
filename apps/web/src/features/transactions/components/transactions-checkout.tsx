import { TrashIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
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
import { CheckoutCustomerStep } from "@/features/transactions/components/checkout-customer-step";
import { CheckoutFooter } from "@/features/transactions/components/checkout-footer";
import { CheckoutItemsStep } from "@/features/transactions/components/checkout-items-step";
import { CheckoutPaymentStep } from "@/features/transactions/components/checkout-payment-step";
import {
	CHECKOUT_STEPS,
	type CheckoutStep,
	CheckoutStepper,
} from "@/features/transactions/components/checkout-stepper";
import { cn } from "@/lib/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

// Three-step POS checkout: Customer → Items → Payment. Body scrolls; the total +
// primary action live in a pinned footer so they stay reachable on the iPad
// sheet. Step is local state and resets to "customer" each time the sheet
// remounts on open.
export const TransactionsCheckout = () => {
	const { resetCart, count } = useCart();
	const [step, setStep] = useState<CheckoutStep>("customer");
	const [direction, setDirection] = useState<"forward" | "back">("forward");
	const dropoffPhoto = useTransactionsPageStore((state) => state.dropoffPhoto);
	const [customerName = "", customerPhone = "", selectedCampaignIds = []] =
		useWatch<
			TransactionDraftValues,
			["customerName", "customerPhone", "selectedCampaignIds"]
		>({ name: ["customerName", "customerPhone", "selectedCampaignIds"] });

	const customerReady = isCustomerReady(customerName, customerPhone);
	const itemsReady = count > 0 && !!dropoffPhoto;

	const stepIndex = CHECKOUT_STEPS.findIndex((entry) => entry.key === step);

	// The current step and any earlier one are always reachable — going back to
	// fix a field is never blocked. A later step is reachable only when its entry
	// gate passes, the same gate the footer's Continue enforces, so the tabs
	// can't skip ahead with an incomplete customer or a missing photo.
	const isStepEnabled = (target: CheckoutStep) => {
		const targetIndex = CHECKOUT_STEPS.findIndex(
			(entry) => entry.key === target,
		);
		if (targetIndex <= stepIndex) {
			return true;
		}
		if (target === "payment") {
			return customerReady && itemsReady;
		}
		// Only "items" can reach here — "customer" is always at or before the
		// current step and already returned above.
		return customerReady;
	};

	const headingRef = useRef<HTMLHeadingElement>(null);

	// Direction is a consequence of the navigation action — set alongside the
	// step so the slide animation always matches the move, with no dependence on
	// render timing.
	const goToStep = (next: CheckoutStep) => {
		if (!isStepEnabled(next)) {
			return;
		}
		const nextIndex = CHECKOUT_STEPS.findIndex((entry) => entry.key === next);
		setDirection(nextIndex >= stepIndex ? "forward" : "back");
		setStep(next);
		// Once the new step paints, move focus to its heading so keyboard /
		// screen-reader users land in the panel instead of staying on the control
		// they just pressed. Only navigation calls this, so the initial open (where
		// the Sheet handles focus) is untouched.
		requestAnimationFrame(() => headingRef.current?.focus());
	};
	const goNext = () => {
		const next = CHECKOUT_STEPS[stepIndex + 1]?.key;
		if (next) {
			goToStep(next);
		}
	};
	const goBack = () => {
		const prev = CHECKOUT_STEPS[stepIndex - 1]?.key;
		if (prev) {
			goToStep(prev);
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<SheetHeader className="flex-row items-center gap-3 border-b border-border/70">
				<SheetTitle className="sr-only">Checkout</SheetTitle>
				<SheetDescription className="sr-only">
					Complete customer, items, and payment to create the order.
				</SheetDescription>
				<div className="min-w-0 flex-1">
					<CheckoutStepper
						current={step}
						isStepEnabled={isStepEnabled}
						onSelect={goToStep}
					/>
				</div>
				<Button
					className="h-11 shrink-0"
					disabled={
						count === 0 &&
						!customerName &&
						!customerPhone &&
						selectedCampaignIds.length === 0 &&
						!dropoffPhoto
					}
					icon={<TrashIcon className="size-4" />}
					onClick={() => {
						resetCart();
						// Start over means start at step one — otherwise Reset on the
						// Payment step strands the cashier there with everything cleared
						// and a disabled Create Order.
						goToStep("customer");
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					Reset
				</Button>
			</SheetHeader>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="grid gap-5 p-4">
					{/* Programmatic focus target + heading for the active step — sr-only
					    because the stepper already shows the labels visually. */}
					<h2 className="sr-only" ref={headingRef} tabIndex={-1}>
						{CHECKOUT_STEPS[stepIndex]?.label}
					</h2>
					<div
						className={cn(
							"animate-in fade-in duration-150 motion-reduce:animate-none",
							direction === "forward"
								? "slide-in-from-right-2"
								: "slide-in-from-left-2",
						)}
						key={step}
					>
						<CheckoutStepBody step={step} />
					</div>
				</div>
			</div>

			<CheckoutFooter onBack={goBack} onContinue={goNext} step={step} />
		</div>
	);
};

interface CheckoutStepBodyProps {
	step: CheckoutStep;
}

// Module-level so it isn't redefined each render (no remount of the step body).
const CheckoutStepBody = ({ step }: CheckoutStepBodyProps) => {
	if (step === "customer") {
		return <CheckoutCustomerStep />;
	}
	if (step === "items") {
		return <CheckoutItemsStep />;
	}
	return <CheckoutPaymentStep />;
};
