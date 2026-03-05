import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CaretDownIcon, CheckIcon, CircleNotch } from "@phosphor-icons/react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
	value: string;
	label: string;
};

type ComboboxProps = {
	id?: string;
	required?: boolean;
	options: ComboboxOption[];
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	searchPlaceholder?: string;
	emptyText?: string;
	loading?: boolean;
	disabled?: boolean;
	className?: string;
	triggerClassName?: string;
};

export function Combobox({
	id,
	required,
	options,
	value,
	onValueChange,
	placeholder = "Select item",
	searchPlaceholder = "Search...",
	emptyText = "No item found",
	loading,
	disabled,
	className,
	triggerClassName,
}: ComboboxProps) {
	const selectedOption = React.useMemo(
		() => options.find((option) => option.value === value) ?? null,
		[options, value],
	);

	const items = React.useMemo(() => {
		if (!selectedOption) {
			return options;
		}

		const hasSelectedInOptions = options.some(
			(option) => option.value === selectedOption.value,
		);

		return hasSelectedInOptions ? options : [selectedOption, ...options];
	}, [options, selectedOption]);

	return (
		<ComboboxPrimitive.Root
			items={items}
			value={selectedOption}
			onValueChange={(nextValue) => onValueChange(nextValue?.value ?? "")}
			itemToStringLabel={(item) => item.label}
			itemToStringValue={(item) => item.value}
			isItemEqualToValue={(item, selected) => item.value === selected.value}
			disabled={disabled}
		>
			<ComboboxPrimitive.Trigger
				id={id}
				aria-required={required}
				data-slot="combobox-trigger"
				className={cn(
					"flex w-full items-center justify-between gap-1.5 rounded-none border border-input bg-transparent py-2 pr-2 pl-2.5 text-xs whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
					triggerClassName,
				)}
			>
				<span className="flex flex-1 items-center gap-2 overflow-hidden text-left">
					<ComboboxPrimitive.Value placeholder={placeholder} />
				</span>
				{loading ? (
					<CircleNotch className="size-4 animate-spin text-muted-foreground" />
				) : (
					<CaretDownIcon className="size-4 text-muted-foreground" />
				)}
			</ComboboxPrimitive.Trigger>

			<ComboboxPrimitive.Portal>
				<ComboboxPrimitive.Positioner className="isolate z-50" sideOffset={4}>
					<ComboboxPrimitive.Popup
						data-slot="combobox-content"
						className={cn(
							"relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-none bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
							className,
						)}
					>
						<div className="relative border-b border-border/80">
							<ComboboxPrimitive.Input
								placeholder={searchPlaceholder}
								className="h-10 w-full border-0 bg-transparent px-2.5 pr-8 text-xs outline-none placeholder:text-muted-foreground"
							/>
							{loading ? (
								<CircleNotch className="absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
							) : null}
						</div>

						<ComboboxPrimitive.List className="max-h-64 overflow-y-auto p-1">
							{(item: ComboboxOption) => (
								<ComboboxPrimitive.Item
									key={item.value}
									value={item}
									className="relative flex w-full cursor-default items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
								>
									<span className="truncate">{item.label}</span>
									<ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
										<CheckIcon className="size-3.5" />
									</ComboboxPrimitive.ItemIndicator>
								</ComboboxPrimitive.Item>
							)}
						</ComboboxPrimitive.List>

						<ComboboxPrimitive.Empty className="px-2 py-3 text-xs text-muted-foreground">
							{loading ? "Loading options..." : emptyText}
						</ComboboxPrimitive.Empty>
					</ComboboxPrimitive.Popup>
				</ComboboxPrimitive.Positioner>
			</ComboboxPrimitive.Portal>
		</ComboboxPrimitive.Root>
	);
}
