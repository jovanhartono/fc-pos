import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HOLD_DURATION_MS = 1000;
const HOLD_KEYS = new Set([" ", "Enter"]);

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

	const startHold = () => {
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

	const canStart = !(disabled || loading || isHolding);

	const beginPointerHold = (event: PointerEvent<HTMLButtonElement>) => {
		if (!canStart) {
			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		startHold();
	};

	// A worker on the counter computer holds Space or Enter instead of the mouse.
	const beginKeyHold = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (!HOLD_KEYS.has(event.key)) {
			return;
		}

		event.preventDefault();
		if (event.repeat || !canStart) {
			return;
		}

		startHold();
	};

	const endKeyHold = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (HOLD_KEYS.has(event.key)) {
			cancelHold();
		}
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
			className={cn(
				"relative touch-none overflow-hidden [-webkit-touch-callout:none] active:scale-100 active:opacity-100",
				className,
			)}
			disabled={disabled || loading}
			loading={loading}
			loadingText="Starting..."
			onContextMenu={(event) => event.preventDefault()}
			onPointerDown={beginPointerHold}
			onPointerUp={cancelHold}
			onPointerCancel={cancelHold}
			onKeyDown={beginKeyHold}
			onKeyUp={endKeyHold}
			onBlur={cancelHold}
		>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-0 bg-primary-foreground/40 transition-[width] duration-75"
				style={{ width: `${progress * 100}%` }}
			/>
			<span className="relative z-10">
				{/* biome-ignore lint/suspicious/noLeakedRender: children is the button label, a ReactNode the caller already renders */}
				{isHolding ? "Keep Holding..." : children}
			</span>
		</Button>
	);
}
