import {
	ArrowLeft02Icon,
	ArrowRight02Icon,
	CreditCardIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { SheetFooter } from "@/components/ui/sheet";
import {
	countUnpricedServiceLines,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { useCheckoutPricing } from "@/features/transactions/hooks/useCheckoutPricing";
import { getCheckoutGates } from "@/features/transactions/lib/checkout-gates";
import type { CheckoutStep } from "@/features/transactions/lib/checkout-steps";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";
import { useTransactionsPageStore } from "@/stores/transactions-store";

const ITEMS_HINT_ID = "checkout-items-hint";

interface CheckoutFooterProps {
	step: CheckoutStep;
	onContinue: () => void;
	onBack: () => void;
}

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
	const submitError = useTransactionsPageStore((state) => state.submitError);
	const dropoffPhoto = useTransactionsPageStore((state) => state.dropoffPhoto);
	const { customerReady, itemsReady } = getCheckoutGates({
		customerName,
		customerPhone,
		itemCount: count,
		hasDropoffPhoto: !!dropoffPhoto,
	});

	// A blank Repair price is normal (ADR-0018): the hint warns it blocks paying
	// now without stopping checkout.
	const unpricedCount = countUnpricedServiceLines(serviceRows);
	const itemsHint =
		step === "items" && count > 0
			? [
					dropoffPhoto ? null : "Add a drop-off photo to continue.",
					unpricedCount > 0
						? "A line has no price yet. The Order stays unpaid until it is priced."
						: null,
				]
					.filter(Boolean)
					.join(" ")
			: "";

	return (
		<SheetFooter className="shrink-0 gap-2 border-t border-border/70 bg-popover">
			{submitError ? <FieldError>{submitError}</FieldError> : null}
			<div className="flex items-center justify-between gap-3">
				<div className="grid gap-0.5">
					<span className="text-subhead font-medium text-muted-foreground">
						Total
					</span>
					<span className="text-headline font-semibold">
						{formatMoney(String(Math.round(pricing.total)))}
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
			{/* Always one line tall, blank when there is nothing to say, so moving
			    between steps or taking the photo never shifts the Total and buttons. */}
			<p
				className={cn(
					"text-muted-foreground text-footnote",
					!itemsHint && "invisible",
				)}
				id={ITEMS_HINT_ID}
			>
				{itemsHint || " "}
			</p>
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
				icon={<HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />}
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
					icon={<HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />}
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
					icon={<HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />}
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
				icon={<HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />}
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
				icon={<HugeiconsIcon icon={CreditCardIcon} className="size-4" />}
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
