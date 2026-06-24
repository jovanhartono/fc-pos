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
	isCustomerReady,
	type TransactionDraftValues,
} from "@/features/transactions/cart/cart";
import { useCart } from "@/features/transactions/cart/useCart";
import { useCheckoutPricing } from "@/features/transactions/hooks/useCheckoutPricing";
import { useTransactionsPageContext } from "@/features/transactions/lib/transactions-context";
import { formatIDRCurrency } from "@/shared/utils";
import { useTransactionsPageStore } from "@/stores/transactions-store";

export type CheckoutStep = "cart" | "payment";

interface CheckoutFooterProps {
	step: CheckoutStep;
	onContinue: () => void;
	onBack: () => void;
}

// Pinned action bar — total + the step's primary button stay visible while the
// step body scrolls above. Self-sources everything from the form/cart/pricing
// hooks; only step + onContinue are owned by the orchestrator.
export const CheckoutFooter = ({
	step,
	onContinue,
	onBack,
}: CheckoutFooterProps) => {
	const { submit } = useTransactionsPageContext();
	const { count } = useCart();
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

	const showPhotoHint = step === "payment" && count > 0 && !dropoffPhoto;

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
				{step === "cart" ? (
					<Button
						type="button"
						size="lg"
						className="h-11"
						onClick={onContinue}
						disabled={count === 0 || !customerReady}
						icon={<ArrowRightIcon className="size-4" />}
					>
						Continue
					</Button>
				) : (
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="h-11"
							onClick={onBack}
							disabled={isSubmitting}
							icon={<ArrowLeftIcon className="size-4" />}
						>
							Back
						</Button>
						<Button
							type="button"
							size="lg"
							className="h-11"
							onClick={submit}
							loading={isSubmitting}
							loadingText="Creating order..."
							disabled={count === 0 || !dropoffPhoto || !customerReady}
							aria-describedby={showPhotoHint ? "create-order-hint" : undefined}
							icon={<CreditCardIcon className="size-4" />}
						>
							Create Order
						</Button>
					</div>
				)}
			</div>
			{showPhotoHint ? (
				<p className="text-muted-foreground text-xs" id="create-order-hint">
					Add a drop-off photo to create the order.
				</p>
			) : null}
		</SheetFooter>
	);
};
