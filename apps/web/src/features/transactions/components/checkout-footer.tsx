import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CreditCardIcon,
} from "@phosphor-icons/react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import {
	countUnpricedServiceLines,
	isCustomerReady,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import type { CheckoutStep } from "@/features/transactions/components/checkout-stepper";
import { useCheckoutPricing } from "@/features/transactions/hooks/useCheckoutPricing";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import { formatIDRCurrency } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

// Shared between the hint element and the Continue button's aria-describedby so
// the two can't drift apart.
const ITEMS_HINT_ID = "checkout-items-hint";

interface CheckoutFooterProps {
	step: CheckoutStep;
	onContinue: () => void;
	onBack: () => void;
}

// Pinned action bar — total + the step's primary button stay visible while the
// step body scrolls above. Self-sources everything from the form/cart/pricing
// hooks; only step + onContinue/onBack are owned by the orchestrator.
export const CheckoutFooter = ({
	step,
	onContinue,
	onBack,
}: CheckoutFooterProps) => {
	const { submit } = useTransactionsPageContext();
	const { count, serviceRows } = useCart();
	const { pricing } = useCheckoutPricing();
	const form = useFormContext<TransactionDraftValues>();
	const isSubmitting = form.formState.isSubmitting;
	const [customerName = "", customerPhone = ""] = useWatch<
		TransactionDraftValues,
		["customerName", "customerPhone"]
	>({ name: ["customerName", "customerPhone"] });
	const customerReady = isCustomerReady(customerName, customerPhone);
	const submitError = useTransactionsPageStore((state) => state.submitError);
	const dropoffPhoto = useTransactionsPageStore((state) => state.dropoffPhoto);

	// Leaving the Items step needs the drop-off photo (captured there) and a
	// price on every no-list-price line (ADR-0018) — the same rule the server
	// enforces, surfaced before the cashier walks into a rejection.
	const unpricedCount = countUnpricedServiceLines(serviceRows);
	const itemsReady = count > 0 && !!dropoffPhoto && unpricedCount === 0;
	const itemsHint =
		step === "items" && count > 0
			? [
					dropoffPhoto ? null : "Add a drop-off photo to continue.",
					unpricedCount > 0 ? "Enter a price for each repair line." : null,
				]
					.filter(Boolean)
					.join(" ")
			: "";

	return (
		<SheetFooter className="shrink-0 gap-2 border-t border-border/70 bg-popover">
			{submitError ? <FieldError>{submitError}</FieldError> : null}
			<div className="flex items-center justify-between gap-3">
				<div className="grid gap-0.5">
					<span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Total
					</span>
					<span className="text-base font-semibold">
						{formatIDRCurrency(String(Math.round(pricing.total)))}
					</span>
				</div>
				<CheckoutStepActions
					customerReady={customerReady}
					isSubmitting={isSubmitting}
					itemsReady={itemsReady}
					onBack={onBack}
					onContinue={onContinue}
					onSubmit={submit}
					photoHintId={itemsHint ? ITEMS_HINT_ID : undefined}
					step={step}
				/>
			</div>
			{itemsHint ? (
				<p className="text-muted-foreground text-xs" id={ITEMS_HINT_ID}>
					{itemsHint}
				</p>
			) : null}
		</SheetFooter>
	);
};

interface CheckoutStepActionsProps {
	step: CheckoutStep;
	onContinue: () => void;
	onBack: () => void;
	onSubmit: () => void;
	customerReady: boolean;
	itemsReady: boolean;
	isSubmitting: boolean;
	photoHintId?: string;
}

// One button set per step. Early returns instead of a nested ternary keep each
// variant readable and lint-clean.
const CheckoutStepActions = ({
	step,
	onContinue,
	onBack,
	onSubmit,
	customerReady,
	itemsReady,
	isSubmitting,
	photoHintId,
}: CheckoutStepActionsProps) => {
	if (step === "customer") {
		return (
			<Button
				className="h-11"
				disabled={!customerReady}
				icon={<ArrowRightIcon className="size-4" />}
				onClick={onContinue}
				size="lg"
				type="button"
			>
				Continue
			</Button>
		);
	}

	if (step === "items") {
		return (
			<div className="flex items-center gap-2">
				<Button
					className="h-11"
					icon={<ArrowLeftIcon className="size-4" />}
					onClick={onBack}
					size="lg"
					type="button"
					variant="outline"
				>
					Back
				</Button>
				<Button
					aria-describedby={photoHintId}
					className="h-11"
					disabled={!itemsReady}
					icon={<ArrowRightIcon className="size-4" />}
					onClick={onContinue}
					size="lg"
					type="button"
				>
					Continue
				</Button>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<Button
				className="h-11"
				disabled={isSubmitting}
				icon={<ArrowLeftIcon className="size-4" />}
				onClick={onBack}
				size="lg"
				type="button"
				variant="outline"
			>
				Back
			</Button>
			<Button
				className="h-11"
				disabled={!(customerReady && itemsReady)}
				icon={<CreditCardIcon className="size-4" />}
				loading={isSubmitting}
				loadingText="Creating order..."
				onClick={onSubmit}
				size="lg"
				type="button"
			>
				Create Order
			</Button>
		</div>
	);
};
