import { CalendarBlank, X } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
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
};

export function DateRangeFilter({
	dateFrom,
	dateTo,
	onRangeChange,
	onClear,
}: DateRangeFilterProps) {
	const hasRange = Boolean(dateFrom || dateTo);
	const selectedRangeFromProps: DateRange | undefined = hasRange
		? {
				from: dateFrom ? parseISO(dateFrom) : undefined,
				to: dateTo ? parseISO(dateTo) : undefined,
			}
		: undefined;
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
		<div className="grid gap-3 rounded-none border border-border/70 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
			<Field>
				<FieldLabel htmlFor="date-range-trigger">Date range</FieldLabel>
				<Popover>
					<PopoverTrigger
						render={
							<Button
								id="date-range-trigger"
								type="button"
								variant="outline"
								className={cn(
									"h-11 w-full justify-start border-border bg-background text-left font-normal",
									!hasRange && "text-muted-foreground",
								)}
							/>
						}
					>
						<CalendarBlank className="size-4" weight="duotone" />
						<span className="truncate">{label}</span>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						<Calendar
							resetOnSelect
							mode="range"
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
			</Field>

			<Button
				type="button"
				variant="outline"
				className="h-11"
				icon={<X className="size-4" weight="duotone" />}
				disabled={!hasRange}
				onClick={onClear}
			>
				Clear dates
			</Button>
		</div>
	);
}
