"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

function Tabs({
	className,
	orientation = "horizontal",
	...props
}: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			className={cn(
				"group/tabs flex gap-2 data-horizontal:flex-col",
				className,
			)}
			{...props}
		/>
	);
}

const tabsListVariants = cva(
	"group/tabs-list relative inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-sm p-0.5 text-muted-foreground [scrollbar-width:none] group-data-horizontal/tabs:h-9 pointer-coarse:group-data-horizontal/tabs:h-10 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
	{
		variants: {
			variant: {
				default: "bg-secondary",
				line: "gap-1 bg-transparent",
				// More tabs than fit (Reports' nine): the chip strip's pills, scrolling.
				pill: "gap-2 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto pointer-coarse:group-data-horizontal/tabs:h-auto",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function TabsList({
	className,
	variant = "default",
	...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
	const listRef = useRef<HTMLDivElement>(null);
	const shownActiveRef = useRef<HTMLElement | null>(null);

	// A phone shows four of the nine Reports tabs; a link that opens Workers
	// would otherwise leave the open tab scrolled out of sight.
	useEffect(() => {
		const list = listRef.current;
		const active = list?.querySelector<HTMLElement>("[data-active]");
		if (!(list && active) || active === shownActiveRef.current) {
			return;
		}
		shownActiveRef.current = active;
		const start = active.offsetLeft;
		// The pill strip fades its last 2rem, so a tab under the fade counts as hidden.
		const end = start + active.offsetWidth + 32;
		if (start < list.scrollLeft || end > list.scrollLeft + list.clientWidth) {
			list.scrollLeft = start - (list.clientWidth - active.offsetWidth) / 2;
		}
	});

	return (
		<TabsPrimitive.List
			ref={listRef}
			data-slot="tabs-list"
			data-variant={variant}
			className={cn(tabsListVariants({ variant }), className)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"relative inline-flex h-full flex-1 shrink-0 items-center justify-center gap-1.5 rounded-[calc(var(--radius-sm)-2px)] px-3 text-subhead font-medium whitespace-nowrap text-foreground transition-[background-color,box-shadow] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-vertical/tabs:py-[calc(--spacing(1.25))] not-data-active:hover:bg-foreground/[0.05] focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				"group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:shadow-none",
				"group-data-[variant=default]/tabs-list:data-active:bg-primary group-data-[variant=default]/tabs-list:data-active:text-primary-foreground group-data-[variant=default]/tabs-list:data-active:focus-visible:ring-primary-foreground/70",
				"group-data-[variant=pill]/tabs-list:h-9 group-data-[variant=pill]/tabs-list:flex-none group-data-[variant=pill]/tabs-list:rounded-full group-data-[variant=pill]/tabs-list:bg-secondary group-data-[variant=pill]/tabs-list:px-3.5 group-data-[variant=pill]/tabs-list:text-body group-data-[variant=pill]/tabs-list:not-data-active:hover:bg-secondary/80 group-data-[variant=pill]/tabs-list:data-active:bg-primary group-data-[variant=pill]/tabs-list:data-active:text-primary-foreground group-data-[variant=pill]/tabs-list:data-active:shadow-none group-data-[variant=pill]/tabs-list:data-active:focus-visible:ring-primary-foreground/70 pointer-coarse:group-data-[variant=pill]/tabs-list:h-10",
				"after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			data-slot="tabs-content"
			className={cn("flex-1 text-footnote/relaxed outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
