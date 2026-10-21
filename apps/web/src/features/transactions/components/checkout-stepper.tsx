import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	CHECKOUT_STEPS,
	type CheckoutStep,
} from "@/features/transactions/lib/checkout-steps";
import { cn } from "@/lib/utils";

interface CheckoutStepperProps {
	current: CheckoutStep;
	onSelect: (step: CheckoutStep) => void;
	isStepEnabled: (step: CheckoutStep) => boolean;
	lockHintId?: string;
}

// Labeled progress header. New cashiers follow Continue; the labels say what's
// next. Tabs double as a jump control — gated by isStepEnabled so a cashier
// can't skip past an incomplete step (the same gate the footer's Continue
// enforces). Going back is always allowed; earlier steps have weaker gates.
export const CheckoutStepper = ({
	current,
	onSelect,
	isStepEnabled,
	lockHintId,
}: CheckoutStepperProps) => {
	const currentIndex = CHECKOUT_STEPS.findIndex((step) => step.key === current);

	return (
		<nav
			aria-label="Checkout steps"
			className="flex items-stretch gap-0.5 rounded-lg bg-secondary p-0.5"
		>
			{CHECKOUT_STEPS.map((step, index) => {
				const isCurrent = step.key === current;
				const isComplete = index < currentIndex;
				// aria-disabled, never disabled: a `disabled` button leaves the tab order,
				// taking the hint that explains the lock out of reach. Guard the click.
				const isLocked = !isStepEnabled(step.key);

				return (
					<button
						aria-current={isCurrent ? "step" : undefined}
						// On the locked button itself, not on the <nav>: a description
						// hung off a landmark is not read out when focus lands on a child,
						// which would leave the lock unexplained again.
						aria-describedby={isLocked ? lockHintId : undefined}
						aria-disabled={isLocked || undefined}
						className={cn(
							"flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md px-2 font-medium text-subhead outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:min-h-10",
							isCurrent
								? "bg-primary text-primary-foreground"
								: "text-foreground hover:bg-background/60",
							isLocked &&
								"cursor-not-allowed text-muted-foreground hover:bg-transparent",
						)}
						key={step.key}
						onClick={() => {
							if (!isLocked) {
								onSelect(step.key);
							}
						}}
						type="button"
					>
						<span
							className={cn(
								"flex size-5 shrink-0 items-center justify-center rounded-full text-caption tabular-nums",
								isCurrent
									? "bg-primary-foreground/25"
									: "bg-muted-foreground/15",
							)}
						>
							{isComplete ? (
								<HugeiconsIcon
									icon={Tick02Icon}
									className="size-3"
									strokeWidth={2}
								/>
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
