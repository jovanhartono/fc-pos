import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HOLD_DURATION_MS = 1000;

type HoldToConfirmButtonProps = {
	children: string;
	disabled?: boolean;
	loading?: boolean;
	className?: string;
	onComplete: () => Promise<void> | void;
};

export function HoldToConfirmButton({
	children,
	disabled,
	loading,
	className,
	onComplete,
}: HoldToConfirmButtonProps) {
	const frameRef = useRef<number | null>(null);
	const startTimeRef = useRef<number | null>(null);
	const completedRef = useRef(false);
	const [isHolding, setIsHolding] = useState(false);
	const [progress, setProgress] = useState(0);

	const clearAnimation = () => {
		if (frameRef.current !== null) {
			cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
	};

	const resetHold = () => {
		clearAnimation();
		startTimeRef.current = null;
		completedRef.current = false;
		setIsHolding(false);
		setProgress(0);
	};

	useEffect(() => {
		return () => {
			if (frameRef.current !== null) {
				cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			startTimeRef.current = null;
			completedRef.current = false;
		};
	}, []);

	const beginHold = () => {
		if (disabled || loading || isHolding) {
			return;
		}

		setIsHolding(true);
		completedRef.current = false;
		startTimeRef.current = performance.now();

		const tick = (now: number) => {
			if (startTimeRef.current === null) {
				return;
			}

			const nextProgress = Math.min(
				(now - startTimeRef.current) / HOLD_DURATION_MS,
				1,
			);
			setProgress(nextProgress);

			if (nextProgress >= 1) {
				clearAnimation();
				startTimeRef.current = null;
				completedRef.current = true;
				setIsHolding(false);
				void onComplete();
				return;
			}

			frameRef.current = requestAnimationFrame(tick);
		};

		frameRef.current = requestAnimationFrame(tick);
	};

	const cancelHold = () => {
		if (completedRef.current || loading) {
			return;
		}

		resetHold();
	};

	return (
		<Button
			type="button"
			className={cn("relative overflow-hidden", className)}
			disabled={disabled || loading}
			loading={loading}
			loadingText="Starting..."
			onPointerDown={beginHold}
			onPointerUp={cancelHold}
			onPointerCancel={cancelHold}
			onPointerLeave={cancelHold}
		>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-0 bg-background/20 transition-[width] duration-75"
				style={{ width: `${progress * 100}%` }}
			/>
			<span className="relative z-10">
				{isHolding ? "Keep holding..." : children}
			</span>
		</Button>
	);
}
