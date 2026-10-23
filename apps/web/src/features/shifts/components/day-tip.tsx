import type { ReactNode } from "react";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { clockRange } from "@/features/shifts/lib/shift-times";
import {
	type DayMark,
	rangeLabel,
} from "@/features/shifts/lib/shifts-overview";
import { formatShiftLength } from "@/lib/dayjs";

export const dayLabel = (day: string) => rangeLabel({ from: day, to: day });

interface DayDetailProps {
	mark: DayMark | undefined;
	day: string;
	today: string;
	elsewhere: string | undefined;
}

// An admin checking one person's day before payroll, without opening the sheet.
export const DayDetail = ({ mark, day, today, elsewhere }: DayDetailProps) => {
	if (day > today) {
		return null;
	}
	if (!mark) {
		// At 09:30 someone due at 10:00 hasn't missed the day yet.
		const absent = day === today ? "Not in yet" : "Day off";
		return (
			<span className="block font-normal text-muted-foreground">
				{elsewhere === undefined ? absent : `At ${elsewhere}`}
			</span>
		);
	}
	if (mark.forgotten > 0) {
		return (
			<span className="block font-normal text-destructive">Auto-closed</span>
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
	anchor: Element | undefined;
	children: ReactNode;
}

// Stays open while the mouse crosses columns and only moves, with no fade, so
// it doesn't blink on every day. The grid clears it on scroll, so no tracking.
export const DayTip = ({ anchor, children }: DayTipProps) => (
	<Tooltip open={anchor !== undefined}>
		<TooltipContent
			anchor={anchor}
			disableAnchorTracking
			sideOffset={6}
			aria-hidden
			className="pointer-events-none block animate-none! font-medium"
		>
			{children}
		</TooltipContent>
	</Tooltip>
);
