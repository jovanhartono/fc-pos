import { CalendarBlankIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { DateRange, Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import {
	getPresets,
	jakartaToday,
	matchPreset,
	type RangePreset,
} from "@/shared/date-presets";

const DISPLAY_FORMAT = "MMM D, YYYY";
const WIRE_FORMAT = "YYYY-MM-DD";

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
	const selected = value ? dayjs(value).toDate() : undefined;

	const disabledMatchers = useMemo<Matcher[] | undefined>(() => {
		const matchers: Matcher[] = [];
		if (max) {
			matchers.push({ after: dayjs(max).toDate() });
		}
		if (min) {
			matchers.push({ before: dayjs(min).toDate() });
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
							"h-10 pointer-coarse:h-11 justify-start font-normal",
							!value && "text-muted-foreground",
							className,
						)}
						icon={<CalendarBlankIcon className="size-4" />}
					/>
				}
			>
				<span className="truncate">
					{/* biome-ignore lint/suspicious/noLeakedRender: placeholder is a string prop, so no 0 or NaN can reach the DOM */}
					{value ? dayjs(value).format(DISPLAY_FORMAT) : placeholder}
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={selected}
					disabled={disabledMatchers}
					onSelect={(date) => {
						onChange(date ? dayjs(date).format(WIRE_FORMAT) : undefined);
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
			from: from ? dayjs(from).toDate() : undefined,
			to: to ? dayjs(to).toDate() : undefined,
		};
	}, [from, to]);

	const [draftRange, setDraftRange] = useState<DateRange | undefined>(
		selectedFromProps,
	);
	const [isOpen, setIsOpen] = useState(false);
	// The preset list eats the height a second month needs, and a popover taller
	// than the counter's phone cannot be scrolled back into view.
	const isMobile = useIsMobile(640);

	useEffect(() => {
		setDraftRange(selectedFromProps);
	}, [selectedFromProps]);

	const displayRange = draftRange ?? selectedFromProps;
	const hasValue = Boolean(from || to);
	const showClear = Boolean(onClear) && hasValue;

	const presets = useMemo(() => getPresets(), []);
	const activePreset =
		displayRange?.from && displayRange?.to
			? matchPreset(
					presets,
					dayjs(displayRange.from).format(WIRE_FORMAT),
					dayjs(displayRange.to).format(WIRE_FORMAT),
				)
			: undefined;

	const handlePresetSelect = (preset: RangePreset) => {
		setDraftRange({
			from: dayjs(preset.from).toDate(),
			to: dayjs(preset.to).toDate(),
		});
		onChange({ from: preset.from, to: preset.to });
		setIsOpen(false);
	};

	const label = (() => {
		if (activePreset) {
			return activePreset.label;
		}
		if (displayRange?.from && displayRange?.to) {
			return `${dayjs(displayRange.from).format(DISPLAY_FORMAT)} - ${dayjs(displayRange.to).format(DISPLAY_FORMAT)}`;
		}
		if (displayRange?.from) {
			return dayjs(displayRange.from).format(DISPLAY_FORMAT);
		}
		if (displayRange?.to) {
			return dayjs(displayRange.to).format(DISPLAY_FORMAT);
		}
		return placeholder;
	})();

	const picker = (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				render={
					<Button
						id={id}
						type="button"
						variant="outline"
						disabled={disabled}
						className={cn(
							"h-10 pointer-coarse:h-11 justify-start font-normal",
							!hasValue && "text-muted-foreground",
							showClear && "pr-9",
							className,
						)}
						icon={<CalendarBlankIcon className="size-4" />}
					/>
				}
			>
				<span className="truncate">{label}</span>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[min(19rem,calc(100vw-4rem))] p-0 sm:w-auto"
			>
				<div className="flex flex-col sm:flex-row">
					<div className="grid grid-cols-3 gap-1 border-b p-1.5 sm:w-36 sm:auto-rows-min sm:grid-cols-1 sm:border-r sm:border-b-0 sm:p-2">
						{presets.map((preset) => (
							<button
								type="button"
								key={preset.id}
								onClick={() => handlePresetSelect(preset)}
								className={cn(
									"border px-2 py-1 text-xs sm:py-1.5 sm:text-left",
									activePreset?.id === preset.id
										? "border-foreground bg-foreground text-background"
										: "border-border/70 text-muted-foreground hover:text-foreground",
								)}
							>
								{preset.label}
							</button>
						))}
					</div>
					<Calendar
						className="mx-auto sm:mx-0"
						mode="range"
						resetOnSelect={resetOnSelect}
						defaultMonth={displayRange?.from}
						selected={displayRange}
						numberOfMonths={isMobile ? 1 : numberOfMonths}
						disabled={{ after: dayjs(jakartaToday()).toDate() }}
						onSelect={(range) => {
							setDraftRange(range);
							if (commitOnComplete && !(range?.from && range?.to)) {
								return;
							}
							if (!(range?.from || range?.to) && !hasValue) {
								return;
							}
							onChange({
								from: range?.from
									? dayjs(range.from).format(WIRE_FORMAT)
									: undefined,
								to: range?.to ? dayjs(range.to).format(WIRE_FORMAT) : undefined,
							});
						}}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);

	if (!onClear) {
		return picker;
	}

	return (
		<div className="relative inline-flex w-fit">
			{picker}
			{showClear ? (
				<button
					type="button"
					aria-label="Clear date range"
					onClick={onClear}
					className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
				>
					<XIcon className="size-4" />
				</button>
			) : null}
		</div>
	);
};
