import {
	ArrowDown01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import {
	type DayButton,
	DayPicker,
	getDefaultClassNames,
	type Locale,
} from "react-day-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	captionLayout = "label",
	buttonVariant = "ghost",
	locale,
	formatters,
	components,
	...props
}: React.ComponentProps<typeof DayPicker> & {
	buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
	const defaultClassNames = getDefaultClassNames();

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn(
				"group/calendar rounded-md bg-popover p-2 [--cell-radius:var(--radius-sm)] [--cell-size:--spacing(9)] pointer-coarse:[--cell-size:--spacing(10)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
				String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
				String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
				className,
			)}
			captionLayout={captionLayout}
			locale={locale}
			formatters={{
				formatMonthDropdown: (date) =>
					date.toLocaleString(locale?.code, { month: "short" }),
				...formatters,
			}}
			classNames={{
				root: cn("w-fit", defaultClassNames.root),
				months: cn(
					"relative flex flex-col gap-4 md:flex-row",
					defaultClassNames.months,
				),
				month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
				nav: cn(
					"absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
					defaultClassNames.nav,
				),
				button_previous: cn(
					buttonVariants({ variant: buttonVariant }),
					"size-(--cell-size) p-0 text-primary select-none hover:text-primary aria-disabled:opacity-50 pointer-coarse:size-(--cell-size)",
					defaultClassNames.button_previous,
				),
				button_next: cn(
					buttonVariants({ variant: buttonVariant }),
					"size-(--cell-size) p-0 text-primary select-none hover:text-primary aria-disabled:opacity-50 pointer-coarse:size-(--cell-size)",
					defaultClassNames.button_next,
				),
				month_caption: cn(
					"flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
					defaultClassNames.month_caption,
				),
				dropdowns: cn(
					"flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-subhead font-semibold",
					defaultClassNames.dropdowns,
				),
				dropdown_root: cn(
					"relative rounded-(--cell-radius)",
					defaultClassNames.dropdown_root,
				),
				dropdown: cn(
					"absolute inset-0 bg-popover opacity-0",
					defaultClassNames.dropdown,
				),
				caption_label: cn(
					"text-subhead font-semibold select-none",
					captionLayout === "label"
						? ""
						: "flex items-center gap-1 rounded-(--cell-radius) [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
					defaultClassNames.caption_label,
				),
				month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
				weekdays: cn("flex", defaultClassNames.weekdays),
				weekday: cn(
					"flex-1 rounded-(--cell-radius) text-footnote font-normal text-muted-foreground select-none",
					defaultClassNames.weekday,
				),
				week: cn("mt-2 flex w-full", defaultClassNames.week),
				week_number_header: cn(
					"w-(--cell-size) select-none",
					defaultClassNames.week_number_header,
				),
				week_number: cn(
					"text-footnote text-muted-foreground select-none",
					defaultClassNames.week_number,
				),
				day: cn(
					"group/day relative h-(--cell-size) w-full p-0 text-center select-none",
					defaultClassNames.day,
				),
				// The band runs from the centre of the start circle to the centre of the
				// end one, however wide the sheet stretches each day.
				range_start: cn(
					"relative isolate z-0 bg-linear-to-r from-transparent from-50% to-primary/12 to-50% [&.rdp-range_end]:bg-none",
					defaultClassNames.range_start,
				),
				range_middle: cn(
					"rounded-none bg-primary/12",
					defaultClassNames.range_middle,
				),
				range_end: cn(
					"relative isolate z-0 bg-linear-to-r from-primary/12 from-50% to-transparent to-50%",
					defaultClassNames.range_end,
				),
				today: cn(
					"text-primary [&_button]:font-semibold",
					defaultClassNames.today,
				),
				outside: cn(
					"text-muted-foreground aria-selected:text-muted-foreground",
					defaultClassNames.outside,
				),
				disabled: cn(
					"text-muted-foreground opacity-50",
					defaultClassNames.disabled,
				),
				hidden: cn("invisible", defaultClassNames.hidden),
				...classNames,
			}}
			components={{
				// biome-ignore lint/correctness/noNestedComponentDefinitions: react-day-picker render-prop slot; relies on contextual typing
				Root: ({ className, rootRef, ...props }) => {
					return (
						<div
							data-slot="calendar"
							ref={rootRef}
							className={cn(className)}
							{...props}
						/>
					);
				},
				// biome-ignore lint/correctness/noNestedComponentDefinitions: react-day-picker render-prop slot; relies on contextual typing
				Chevron: ({ className, orientation, ...props }) => {
					if (orientation === "left") {
						return (
							<HugeiconsIcon
								icon={ArrowLeft01Icon}
								className={cn("size-4", className)}
								{...props}
							/>
						);
					}

					if (orientation === "right") {
						return (
							<HugeiconsIcon
								icon={ArrowRight01Icon}
								className={cn("size-4", className)}
								{...props}
							/>
						);
					}

					return (
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							className={cn("size-4", className)}
							{...props}
						/>
					);
				},
				// biome-ignore lint/correctness/noNestedComponentDefinitions: react-day-picker render-prop slot; closes over locale
				DayButton: ({ ...props }) => (
					<CalendarDayButton locale={locale} {...props} />
				),
				// biome-ignore lint/correctness/noNestedComponentDefinitions: react-day-picker render-prop slot; relies on contextual typing
				WeekNumber: ({ children, ...props }) => {
					return (
						<td {...props}>
							<div className="flex size-(--cell-size) items-center justify-center text-center">
								{children}
							</div>
						</td>
					);
				},
				...components,
			}}
			{...props}
		/>
	);
}

function CalendarDayButton({
	className,
	day,
	modifiers,
	locale,
	...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
	const defaultClassNames = getDefaultClassNames();

	const ref = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	return (
		<Button
			variant="ghost"
			size="icon"
			data-day={day.date.toLocaleDateString(locale?.code)}
			data-selected-single={
				modifiers.selected &&
				!modifiers.range_start &&
				!modifiers.range_end &&
				!modifiers.range_middle
			}
			data-range-start={modifiers.range_start}
			data-range-end={modifiers.range_end}
			data-range-middle={modifiers.range_middle}
			className={cn(
				"relative isolate z-10 mx-auto flex size-(--cell-size) flex-col gap-1 rounded-full border-0 text-subhead leading-none font-normal pointer-coarse:size-(--cell-size) group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/40 data-[range-end=true]:rounded-full data-[range-end=true]:bg-primary data-[range-end=true]:font-semibold data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-transparent data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-full data-[range-start=true]:bg-primary data-[range-start=true]:font-semibold data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:font-semibold data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-footnote [&>span]:opacity-70",
				defaultClassNames.day,
				className,
			)}
			{...props}
		/>
	);
}

export { Calendar, CalendarDayButton };
