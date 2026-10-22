import { type ReactNode, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { clockRange } from "@/features/shifts/lib/shift-times";
import {
	type DayMark,
	rangeLabel,
} from "@/features/shifts/lib/shifts-overview";
import { formatShiftLength } from "@/lib/dayjs";

const GAP = 6;
const EDGE = 8;

export const dayLabel = (day: string) => rangeLabel({ from: day, to: day });

interface DayDetailProps {
	mark: DayMark | undefined;
	isFuture: boolean;
	elsewhere: string | undefined;
}

// An admin checking one person's day before payroll, without opening the sheet.
export const DayDetail = ({ mark, isFuture, elsewhere }: DayDetailProps) => {
	if (isFuture) {
		return null;
	}
	if (!mark) {
		return (
			<span className="block font-normal text-muted-foreground">
				{elsewhere ? `At ${elsewhere}` : "Day off"}
			</span>
		);
	}
	if (mark.forgotten > 0) {
		return (
			<span className="block font-normal text-destructive">
				Forgotten clock-out
			</span>
		);
	}
	const length = formatShiftLength(mark.minutes);
	const text =
		mark.shifts > 1
			? `${mark.shifts} Shifts · 1 day · ${length}`
			: `${clockRange({ clock_in_at: mark.firstIn, clock_out_at: mark.lastOut })} · ${length}`;
	return (
		<span className="block font-normal text-muted-foreground tabular-nums">
			{text}
		</span>
	);
};

interface DayTipProps {
	anchor: DOMRect;
	children: ReactNode;
}

// Fixed to the viewport so the card's rounded clip can't cut it, and kept on
// screen over the first and last columns.
export const DayTip = ({ anchor, children }: DayTipProps) => {
	const ref = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const tip = ref.current;
		if (!tip) {
			return;
		}
		const { width, height } = tip.getBoundingClientRect();
		const maxLeft = document.documentElement.clientWidth - width - EDGE;
		const centered = anchor.left + anchor.width / 2 - width / 2;
		const above = anchor.top - GAP - height;
		tip.style.left = `${Math.max(EDGE, Math.min(centered, maxLeft))}px`;
		tip.style.top = `${above >= EDGE ? above : anchor.bottom + GAP}px`;
	}, [anchor]);

	return createPortal(
		<div
			ref={ref}
			aria-hidden
			className="pointer-events-none fixed top-0 left-0 z-50 w-max max-w-xs rounded-sm bg-popover px-2.5 py-1.5 font-medium text-footnote text-popover-foreground shadow-md ring-1 ring-black/10 dark:ring-white/10"
		>
			{children}
		</div>,
		document.body,
	);
};
