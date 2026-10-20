import type { PropsWithChildren } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A row of chips that outgrows its container — /queue's six statuses and the POS
// catalog's ten categories both do. The mask fades the last chip out instead of
// slicing it mid-word, which read as a broken layout rather than as "there is
// more this way". Unconditional, not phone-only: whether the strip overflows
// depends on the container — the expanded sidebar cuts it at 1024 too — and when
// it does fit the fade lands on empty padding.
export const STRIP_FADE =
	"[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]";

export const ChipStripScroller = ({ children }: PropsWithChildren) => (
	<div className={`-m-1 shrink-0 overflow-x-auto py-1 ${STRIP_FADE}`}>
		{children}
	</div>
);

// The row inside the scroller stays with each caller: /queue's chips are a
// tablist, the catalog's are a fieldset of toggles, and flattening that into one
// element would trade the screen reader's answer for a shared wrapper. Only the
// measurements travel — pr-8 is what keeps the last chip clear of the fade.
export const CHIP_STRIP_ROW = "flex min-w-max gap-2 px-1 pr-8";

interface StatusChip<TValue extends string> {
	count?: number;
	label: string;
	value: TValue;
}

interface StatusChipStripProps<TValue extends string> {
	chips: StatusChip<TValue>[];
	legend: string;
	onValueChange: (value: TValue) => void;
	value: TValue;
}

// The status filter on /queue and /orders, so the two read as one product.
export const StatusChipStrip = <TValue extends string>({
	chips,
	legend,
	onValueChange,
	value,
}: StatusChipStripProps<TValue>) => (
	<ChipStripScroller>
		{/* Toggle buttons, not tabs: tablist semantics promise arrow-key roving
		    and tabpanels these filter chips don't have. */}
		<fieldset className={cn(CHIP_STRIP_ROW, "border-0 p-0")}>
			<legend className="sr-only">{legend}</legend>
			{chips.map((chip) => {
				const isActive = value === chip.value;
				return (
					<Button
						aria-pressed={isActive}
						className={cn(
							"h-9 gap-1.5 rounded-full border-0 px-3.5 font-medium text-body pointer-coarse:h-10",
							!isActive && "text-foreground",
						)}
						key={chip.value}
						onClick={() => onValueChange(chip.value)}
						type="button"
						variant={isActive ? "default" : "secondary"}
					>
						{chip.label}
						{/* The count keeps a 4-digit slot even before it loads, so a
						    chip never grows or shrinks and its neighbours never slide.
						    Inter's table digits run a little wider than 1ch each. */}
						<span
							className={cn(
								"min-w-[4.25ch] text-left font-normal tabular-nums",
								isActive ? "opacity-80" : "opacity-60",
								chip.count === undefined && "invisible",
							)}
						>
							{chip.count ?? 0}
						</span>
					</Button>
				);
			})}
		</fieldset>
	</ChipStripScroller>
);
