import { CalendarBlankIcon, XIcon } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateRangeFilterProps = {
	dateFrom?: string;
	dateTo?: string;
	onRangeChange: (value: { dateFrom?: string; dateTo?: string }) => void;
	onClear: () => void;
	resetOnSelect?: boolean;
};

export function DateRangeFilter({
	dateFrom,
	dateTo,
	onRangeChange,
	onClear,
	resetOnSelect = false,
}: DateRangeFilterProps) {
	const hasRange = Boolean(dateFrom || dateTo);
	const selectedRangeFromProps: DateRange | undefined = useMemo(
		() =>
			hasRange
				? {
						from: dateFrom ? parseISO(dateFrom) : undefined,
						to: dateTo ? parseISO(dateTo) : undefined,
					}
				: undefined,
		[dateFrom, dateTo, hasRange],
	);
	const [draftRange, setDraftRange] = useState<DateRange | undefined>(
		selectedRangeFromProps,
	);

	useEffect(() => {
		setDraftRange(selectedRangeFromProps);
	}, [selectedRangeFromProps]);

	const displayRange = draftRange ?? selectedRangeFromProps;
	const label = displayRange?.from
		? displayRange.to
			? `${format(displayRange.from, "MMM d, yyyy")} - ${format(displayRange.to, "MMM d, yyyy")}`
			: format(displayRange.from, "MMM d, yyyy")
		: "Pick a date range";

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Popover>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="outline"
							className={cn(
								"h-10 justify-start font-normal",
								!hasRange && "text-muted-foreground",
							)}
							icon={<CalendarBlankIcon className="size-4" />}
						/>
					}
				>
					<span className="truncate">{label}</span>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="range"
						resetOnSelect={resetOnSelect}
						defaultMonth={displayRange?.from}
						selected={displayRange}
						numberOfMonths={2}
						onSelect={(range) => {
							setDraftRange(range);

							if (range?.from && range?.to) {
								onRangeChange({
									dateFrom: format(range.from, "yyyy-MM-dd"),
									dateTo: format(range.to, "yyyy-MM-dd"),
								});
							}
						}}
					/>
				</PopoverContent>
			</Popover>

			{hasRange ? (
				<Button
					type="button"
					variant="outline"
					className="h-10"
					icon={<XIcon className="size-4" />}
					onClick={onClear}
				>
					Clear
				</Button>
			) : null}
		</div>
	);
}
