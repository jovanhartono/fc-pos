import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type CheckoutStep = "customer" | "items" | "payment";

// Single source of step order — the orchestrator derives next/back navigation
// and the footer derives its gates from this list.
export const CHECKOUT_STEPS: { key: CheckoutStep; label: string }[] = [
	{ key: "customer", label: "Customer" },
	{ key: "items", label: "Items" },
	{ key: "payment", label: "Payment" },
];

interface CheckoutStepperProps {
	current: CheckoutStep;
	onSelect: (step: CheckoutStep) => void;
	isStepEnabled: (step: CheckoutStep) => boolean;
}

// Labeled progress header. New cashiers follow Continue; the labels say what's
// next. Tabs double as a jump control — gated by isStepEnabled so a cashier
// can't skip past an incomplete step (the same gate the footer's Continue
// enforces). Going back is always allowed; earlier steps have weaker gates.
export const CheckoutStepper = ({
	current,
	onSelect,
	isStepEnabled,
}: CheckoutStepperProps) => {
	const currentIndex = CHECKOUT_STEPS.findIndex((step) => step.key === current);

	return (
		<nav aria-label="Checkout steps" className="flex items-stretch gap-1">
			{CHECKOUT_STEPS.map((step, index) => {
				const isCurrent = step.key === current;
				const isComplete = index < currentIndex;

				return (
					<button
						aria-current={isCurrent ? "step" : undefined}
						className={cn(
							"flex min-h-11 flex-1 items-center justify-center gap-2 border px-2 text-xs font-medium outline-none transition focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
							isCurrent
								? "border-foreground bg-foreground text-background"
								: "border-border/70 text-foreground/60 hover:bg-muted/40",
						)}
						disabled={!isStepEnabled(step.key)}
						key={step.key}
						onClick={() => onSelect(step.key)}
						type="button"
					>
						<span
							className={cn(
								"flex size-5 shrink-0 items-center justify-center border text-[11px] tabular-nums",
								isCurrent ? "border-background/40" : "border-border/60",
							)}
						>
							{isComplete ? (
								<CheckIcon className="size-3" weight="bold" />
							) : (
								index + 1
							)}
						</span>
						{step.label}
					</button>
				);
			})}
		</nav>
	);
};
