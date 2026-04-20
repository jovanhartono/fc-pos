import { CalendarBlankIcon, XIcon } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import type { DateRange, Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DISPLAY_FORMAT = "MMM d, yyyy";
const WIRE_FORMAT = "yyyy-MM-dd";

interface DatePickerProps {
	id?: string;
	value?: string;
	onChange: (value: string | undefined) => void;
	placeholder?: string;
	disabled?: boolean;
	min?: string;
	max?: string;
	className?: string;
}

export const DatePicker = ({
	id,
	value,
	onChange,
	placeholder = "Pick a date",
	disabled,
	min,
	max,
	className,
}: DatePickerProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const selected = value ? parseISO(value) : undefined;

	const disabledMatchers = useMemo<Matcher[] | undefined>(() => {
		const matchers: Matcher[] = [];
		if (max) {
			matchers.push({ after: parseISO(max) });
		}
		if (min) {
			matchers.push({ before: parseISO(min) });
		}
		return matchers.length > 0 ? matchers : undefined;
	}, [min, max]);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				render={
					<Button
						id={id}
						type="button"
						variant="outline"
						disabled={disabled}
						className={cn(
							"h-10 justify-start font-normal",
							!value && "text-muted-foreground",
							className,
						)}
						icon={<CalendarBlankIcon className="size-4" />}
					/>
				}
			>
				<span className="truncate">
					{value ? format(selected as Date, DISPLAY_FORMAT) : placeholder}
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={selected}
					disabled={disabledMatchers}
					onSelect={(date) => {
						onChange(date ? format(date, WIRE_FORMAT) : undefined);
						setIsOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
};

interface DateRangePickerProps {
	id?: string;
	from?: string;
	to?: string;
	onChange: (value: { from?: string; to?: string }) => void;
	onClear?: () => void;
	placeholder?: string;
	disabled?: boolean;
	numberOfMonths?: number;
	className?: string;
	resetOnSelect?: boolean;
	commitOnComplete?: boolean;
}

export const DateRangePicker = ({
	id,
	from,
	to,
	onChange,
	onClear,
	placeholder = "Pick a date range",
	disabled,
	numberOfMonths = 2,
	className,
	resetOnSelect = false,
	commitOnComplete = false,
}: DateRangePickerProps) => {
	const selectedFromProps = useMemo<DateRange | undefined>(() => {
		if (!(from || to)) {
			return undefined;
		}
		return {
			from: from ? parseISO(from) : undefined,
			to: to ? parseISO(to) : undefined,
		};
	}, [from, to]);

	const [draftRange, setDraftRange] = useState<DateRange | undefined>(
		selectedFromProps,
	);

	useEffect(() => {
		setDraftRange(selectedFromProps);
	}, [selectedFromProps]);

	const displayRange = draftRange ?? selectedFromProps;
	const hasValue = Boolean(from || to);

	const label = (() => {
		if (displayRange?.from && displayRange?.to) {
			return `${format(displayRange.from, DISPLAY_FORMAT)} - ${format(displayRange.to, DISPLAY_FORMAT)}`;
		}
		if (displayRange?.from) {
			return format(displayRange.from, DISPLAY_FORMAT);
		}
		if (displayRange?.to) {
			return format(displayRange.to, DISPLAY_FORMAT);
		}
		return placeholder;
	})();

	const picker = (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						id={id}
						type="button"
						variant="outline"
						disabled={disabled}
						className={cn(
							"h-10 justify-start font-normal",
							!hasValue && "text-muted-foreground",
							className,
						)}
						icon={<CalendarBlankIcon className="size-4" />}
					/>
				}
			>
				<span className="truncate">{label}</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					mode="range"
					resetOnSelect={resetOnSelect}
					defaultMonth={displayRange?.from}
					selected={displayRange}
					numberOfMonths={numberOfMonths}
					onSelect={(range) => {
						setDraftRange(range);
						if (commitOnComplete && !(range?.from && range?.to)) {
							return;
						}
						if (!(range?.from || range?.to) && !hasValue) {
							return;
						}
						onChange({
							from: range?.from ? format(range.from, WIRE_FORMAT) : undefined,
							to: range?.to ? format(range.to, WIRE_FORMAT) : undefined,
						});
					}}
				/>
			</PopoverContent>
		</Popover>
	);

	if (!onClear) {
		return picker;
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			{picker}
			{hasValue ? (
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
};
