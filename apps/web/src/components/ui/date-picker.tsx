import {
	CalendarBlankIcon,
	CaretLeftIcon,
	CaretRightIcon,
	CheckIcon,
	XIcon,
} from "@phosphor-icons/react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import type { DateRange, Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { useIsCoarsePointer, useIsMobile } from "@/hooks/use-mobile";
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

interface DateRangeViewProps {
	trigger: ReactElement;
	label: string;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	presets: RangePreset[];
	activePreset: RangePreset | undefined;
	draftRange: DateRange | undefined;
	onDraftChange: (range: DateRange | undefined) => void;
	onPresetSelect: (preset: RangePreset) => void;
	notFuture: Matcher;
	resetOnSelect: boolean;
}

const SHEET_ROW = "h-11 w-full justify-between px-4 text-sm font-normal";

const DateRangeSheet = ({
	trigger,
	label,
	isOpen,
	onOpenChange,
	presets,
	activePreset,
	draftRange,
	onDraftChange,
	onPresetSelect,
	notFuture,
	resetOnSelect,
	onCommit,
}: DateRangeViewProps & { onCommit: () => void }) => {
	const [isPickingCustom, setIsPickingCustom] = useState(false);

	return (
		<Sheet
			open={isOpen}
			onOpenChange={(open) => {
				onOpenChange(open);
				if (!open) {
					setIsPickingCustom(false);
				}
			}}
		>
			<SheetTrigger render={trigger}>
				<span className="truncate">{label}</span>
			</SheetTrigger>
			<SheetContent
				side="bottom"
				showCloseButton={!isPickingCustom}
				className="max-h-[88svh] gap-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
			>
				{isPickingCustom ? (
					<>
						<SheetHeader className="shrink-0 flex-row items-center gap-1 border-b p-2">
							<Button
								type="button"
								variant="ghost"
								size="icon-lg"
								aria-label="Back to presets"
								onClick={() => setIsPickingCustom(false)}
								icon={<CaretLeftIcon className="size-4" />}
							/>
							<SheetTitle>Custom range</SheetTitle>
						</SheetHeader>
						<div className="shrink-0 border-b px-4 py-3 text-sm">
							{draftRange?.from
								? dayjs(draftRange.from).format(DISPLAY_FORMAT)
								: "Start"}
							{" – "}
							{draftRange?.to
								? dayjs(draftRange.to).format(DISPLAY_FORMAT)
								: "End"}
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto">
							<Calendar
								mode="range"
								resetOnSelect={resetOnSelect}
								className="w-full [--cell-size:--spacing(11)] p-3"
								classNames={{ root: "w-full", week: "mt-1 flex w-full" }}
								defaultMonth={draftRange?.from}
								selected={draftRange}
								numberOfMonths={1}
								disabled={notFuture}
								onSelect={onDraftChange}
							/>
						</div>
						<SheetFooter className="shrink-0 border-t border-border/70 p-3">
							<Button
								type="button"
								className="h-11 w-full"
								disabled={!(draftRange?.from && draftRange?.to)}
								onClick={onCommit}
							>
								Apply
							</Button>
						</SheetFooter>
					</>
				) : (
					<>
						<SheetHeader className="shrink-0 border-b px-4 py-3">
							<SheetTitle>Date range</SheetTitle>
						</SheetHeader>
						<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
							{presets.map((preset) => (
								<Button
									type="button"
									key={preset.id}
									variant="ghost"
									onClick={() => onPresetSelect(preset)}
									className={SHEET_ROW}
								>
									{preset.label}
									{activePreset?.id === preset.id ? (
										<CheckIcon className="size-4" weight="bold" />
									) : null}
								</Button>
							))}
						</div>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setIsPickingCustom(true)}
							className={cn(SHEET_ROW, "shrink-0 border-t border-border/70")}
						>
							Custom range
							<CaretRightIcon className="size-4 text-muted-foreground" />
						</Button>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
};

const DateRangePopover = ({
	trigger,
	label,
	isOpen,
	onOpenChange,
	presets,
	activePreset,
	draftRange,
	onDraftChange,
	onPresetSelect,
	notFuture,
	resetOnSelect,
	numberOfMonths,
}: DateRangeViewProps & { numberOfMonths: number }) => {
	// A second month plus the preset rail overflows a narrow desktop window; touch
	// devices never reach here, they get the sheet.
	const isMobile = useIsMobile(640);

	return (
		<Popover open={isOpen} onOpenChange={onOpenChange}>
			<PopoverTrigger render={trigger}>
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
								onClick={() => onPresetSelect(preset)}
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
						defaultMonth={draftRange?.from}
						selected={draftRange}
						numberOfMonths={isMobile ? 1 : numberOfMonths}
						disabled={notFuture}
						onSelect={onDraftChange}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
};

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
	const isCoarsePointer = useIsCoarsePointer();

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

	const emitRange = (range: DateRange | undefined) => {
		onChange({
			from: range?.from ? dayjs(range.from).format(WIRE_FORMAT) : undefined,
			to: range?.to ? dayjs(range.to).format(WIRE_FORMAT) : undefined,
		});
	};

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

	const shared: DateRangeViewProps = {
		trigger: (
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
		),
		label,
		isOpen,
		onOpenChange: setIsOpen,
		presets,
		activePreset,
		draftRange: displayRange,
		onDraftChange: setDraftRange,
		onPresetSelect: handlePresetSelect,
		notFuture: { after: dayjs(jakartaToday()).toDate() },
		resetOnSelect,
	};

	const picker = isCoarsePointer ? (
		<DateRangeSheet
			{...shared}
			onCommit={() => {
				emitRange(draftRange);
				setIsOpen(false);
			}}
		/>
	) : (
		<DateRangePopover
			{...shared}
			numberOfMonths={numberOfMonths}
			onDraftChange={(range) => {
				setDraftRange(range);
				if (commitOnComplete && !(range?.from && range?.to)) {
					return;
				}
				if (!(range?.from || range?.to) && !hasValue) {
					return;
				}
				emitRange(range);
			}}
		/>
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
