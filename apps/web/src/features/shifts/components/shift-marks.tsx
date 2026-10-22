import type { DayMark } from "@/features/shifts/lib/shifts-overview";
import { cn } from "@/lib/utils";

export type MarkSize = "big" | "small" | "bar" | "strip";

const SIZE_CLASS: Record<MarkSize, string> = {
	big: "size-5 rounded-[0.375rem]",
	small: "size-3.5 rounded-[0.25rem]",
	bar: "h-5 flex-1 rounded-[0.125rem]",
	strip: "h-1.5 flex-1 rounded-full",
};

interface DayMarkCellProps {
	mark: DayMark | undefined;
	isFuture: boolean;
	size: MarkSize;
	col?: number;
}

const FUTURE_CLASS =
	"outline-1 outline-border outline-dashed -outline-offset-1";

// A Forgotten clock-out reads red so an admin checks its hours before payroll.
const fillClass = (mark: DayMark | undefined, isFuture: boolean) => {
	if (isFuture) {
		return FUTURE_CLASS;
	}
	if (!mark) {
		return "bg-soft-bar-track";
	}
	return mark.forgotten > 0 ? "bg-destructive" : "bg-primary";
};

export const DayMarkCell = ({
	mark,
	isFuture,
	size,
	col,
}: DayMarkCellProps) => (
	<span
		aria-hidden
		data-col={col}
		className={cn(
			"inline-block shrink-0",
			SIZE_CLASS[size],
			fillClass(mark, isFuture),
		)}
	/>
);

const LEGEND_CELL = "inline-block size-3 rounded-[0.1875rem]";

export const ShiftsLegend = () => (
	<ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-footnote text-muted-foreground">
		<li className="flex items-center gap-1">
			<span aria-hidden className={cn(LEGEND_CELL, "bg-primary")} />
			clocked in
		</li>
		<li className="flex items-center gap-1">
			<span aria-hidden className={cn(LEGEND_CELL, "bg-destructive")} />
			Forgotten clock-out
		</li>
		<li className="flex items-center gap-1">
			<span aria-hidden className={cn(LEGEND_CELL, FUTURE_CLASS)} />
			upcoming
		</li>
	</ul>
);
