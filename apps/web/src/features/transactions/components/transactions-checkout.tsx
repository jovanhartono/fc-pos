import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { CheckoutCustomerStep } from "@/features/transactions/components/checkout-customer-step";
import { CheckoutFooter } from "@/features/transactions/components/checkout-footer";
import { CheckoutItemsStep } from "@/features/transactions/components/checkout-items-step";
import { CheckoutPaymentStep } from "@/features/transactions/components/checkout-payment-step";
import { CheckoutStepper } from "@/features/transactions/components/checkout-stepper";
import {
	getCheckoutGates,
	lockedStepHint as getLockedStepHint,
	isStepReachable,
} from "@/features/transactions/lib/checkout-gates";
import {
	CHECKOUT_STEPS,
	type CheckoutStep,
} from "@/features/transactions/lib/checkout-steps";
import { cn } from "@/lib/utils";
import { useDialog } from "@/stores/dialog-store";
import { useTransactionsPageStore } from "@/stores/transactions-store";

const LOCKED_STEP_HINT_ID = "checkout-locked-step-hint";

// The total and main button sit in a pinned footer so they stay reachable in
// the sheet on the iPad.
export const TransactionsCheckout = () => {
	const { resetCart, count } = useCart();
	const openDialog = useDialog((state) => state.openDialog);
	const closeDialog = useDialog((state) => state.closeDialog);
	const [step, setStep] = useState<CheckoutStep>("customer");
	const [direction, setDirection] = useState<"forward" | "back">("forward");
	const dropoffPhoto = useTransactionsPageStore((state) => state.dropoffPhoto);
	const [customerName = "", customerPhone = "", selectedCampaignIds = []] =
		useWatch<
			TransactionDraftValues,
			["customerName", "customerPhone", "selectedCampaignIds"]
		>({ name: ["customerName", "customerPhone", "selectedCampaignIds"] });

	const gateInput = {
		customerName,
		customerPhone,
		itemCount: count,
		hasDropoffPhoto: !!dropoffPhoto,
	};
	const gates = getCheckoutGates(gateInput);

	const stepIndex = CHECKOUT_STEPS.findIndex((entry) => entry.key === step);

	// The gate the footer's Continue enforces too, so the tabs can't skip ahead
	// with an incomplete Customer or a missing photo.
	const isStepEnabled = (target: CheckoutStep) =>
		isStepReachable(gates, step, target);

	const lockedStepHint = getLockedStepHint(gates, step, gateInput);

	const headingRef = useRef<HTMLHeadingElement>(null);

	// Direction is set with the step so the slide always matches the move.
	const goToStep = (next: CheckoutStep) => {
		if (!isStepEnabled(next)) {
			return;
		}
		const nextIndex = CHECKOUT_STEPS.findIndex((entry) => entry.key === next);
		setDirection(nextIndex >= stepIndex ? "forward" : "back");
		setStep(next);
		// A screen reader lands in the new step, not on the button just pressed;
		// on first open the Sheet places focus itself.
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
			<SheetHeader className="gap-2 border-b border-border/70">
				<SheetTitle className="sr-only">Checkout</SheetTitle>
				<SheetDescription className="sr-only">
					Complete customer, items, and payment to create the order.
				</SheetDescription>
				<div className="flex flex-row items-center gap-3">
					<div className="min-w-0 flex-1">
						<CheckoutStepper
							current={step}
							isStepEnabled={isStepEnabled}
							lockHintId={lockedStepHint ? LOCKED_STEP_HINT_ID : undefined}
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
						icon={<HugeiconsIcon icon={Delete02Icon} className="size-4" />}
						onClick={() =>
							openDialog({
								title: "Clear the cart?",
								description:
									"Every Item, the Customer, Campaigns and the drop-off photo are removed.",
								footer: () => (
									<>
										<Button variant="outline" onClick={closeDialog}>
											Cancel
										</Button>
										<Button
											variant="destructive"
											onClick={() => {
												resetCart();
												// Reset on the Payment step otherwise strands the cashier
												// there with an empty cart and a disabled Create Order.
												goToStep("customer");
												closeDialog();
											}}
										>
											Clear
										</Button>
									</>
								),
							})
						}
						size="sm"
						type="button"
						variant="outline"
					>
						Reset
					</Button>
				</div>
				{/* Kept as a blank line once every step opens, so filling in the
				    Customer doesn't pull the step's form up under the cashier's tap.
				    Two lines on a phone, where the longest hint wraps. */}
				<p
					className={cn(
						"text-muted-foreground text-footnote max-sm:min-h-8",
						!lockedStepHint && "invisible",
					)}
					id={LOCKED_STEP_HINT_ID}
				>
					{lockedStepHint || " "}
				</p>
			</SheetHeader>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="grid gap-5 p-4">
					{/* Hidden: the stepper already shows the step's name. */}
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

const CheckoutStepBody = ({ step }: CheckoutStepBodyProps) => {
	if (step === "customer") {
		return <CheckoutCustomerStep />;
	}
	if (step === "items") {
		return <CheckoutItemsStep />;
	}
	return <CheckoutPaymentStep />;
};
