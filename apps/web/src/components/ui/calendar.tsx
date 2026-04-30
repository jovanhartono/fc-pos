"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

type CalendarChevronProps = React.ComponentProps<"svg"> & {
	orientation?: "left" | "right" | "up" | "down";
};

function CalendarChevron({
	orientation,
	className,
	...props
}: CalendarChevronProps) {
	return orientation === "left" ? (
		<CaretLeftIcon
			className={cn("size-4", className)}
			weight="bold"
			{...props}
		/>
	) : (
		<CaretRightIcon
			className={cn("size-4", className)}
			weight="bold"
			{...props}
		/>
	);
}

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	...props
}: CalendarProps) {
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			fixedWeeks
			className={cn("p-3", className)}
			classNames={{
				root: "w-fit",
				months: "flex flex-col items-start gap-4 sm:flex-row",
				month: "relative grid gap-4",
				month_caption: "flex h-7 items-center justify-center px-9 pt-1",
				caption_label: "text-sm font-medium",
				nav: "pointer-events-none absolute inset-x-0 top-1 z-10 flex items-center justify-between px-1",
				button_previous: cn(
					buttonVariants({ variant: "outline", size: "icon-sm" }),
					"pointer-events-auto size-7 border-border bg-background p-0",
				),
				button_next: cn(
					buttonVariants({ variant: "outline", size: "icon-sm" }),
					"pointer-events-auto size-7 border-border bg-background p-0",
				),
				month_grid: "border-collapse space-y-1",
				weekdays: "flex",
				weekday: "w-9 text-[0.7rem] font-medium text-muted-foreground",
				week: "mt-2 flex w-full",
				day: "relative size-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
				day_button: cn(
					buttonVariants({ variant: "ghost", size: "icon-sm" }),
					"size-9 rounded-none p-0 font-normal aria-selected:opacity-100",
				),
				today: "bg-muted text-foreground",
				outside: "text-muted-foreground opacity-50",
				disabled: "text-muted-foreground opacity-50",
				selected:
					"bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
				range_start: "bg-primary text-primary-foreground",
				range_middle: "bg-muted text-foreground",
				range_end: "bg-primary text-primary-foreground",
				hidden: "invisible",
				...classNames,
			}}
			components={{
				Chevron: CalendarChevron,
			}}
			{...props}
		/>
	);
}

export { Calendar };
