import type { PropsWithChildren } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// /queue's statuses and the POS Categories outgrow their row; a chip cut mid-word
// looked broken, the fade reads as "more this way" (strip-fade in index.css).
export const STRIP_FADE = "strip-fade";

// Older iPhones keep a fixed fade on the right; room past the last chip keeps
// it clear of that fade.
export const STRIP_FADE_END_ROOM =
	"not-supports-[animation-timeline:scroll()]:pr-[max(2rem,var(--page-right,0px))]";

export const ChipStripScroller = ({ children }: PropsWithChildren) => (
	<div className={`-m-1 shrink-0 overflow-x-auto py-1 ${STRIP_FADE}`}>
		{children}
	</div>
);

// Shared with the POS Category row and its skeleton.
export const CHIP_STRIP_ROW = `flex min-w-max gap-2 px-1 ${STRIP_FADE_END_ROOM}`;

export const CHIP_CLASS =
	"h-9 gap-1.5 rounded-full border-0 px-3.5 font-medium text-body pointer-coarse:h-10";

interface StatusChip<TValue extends string> {
	label: string;
	value: TValue;
	// A dot in a chart's colour, where the chip is that chart's key.
	color?: string;
}

interface StatusChipStripProps<TValue extends string> {
	chips: StatusChip<TValue>[];
	legend: string;
	onValueChange: (value: TValue) => void;
	value: TValue;
	disabled?: boolean;
}

// The status filter on /queue and /orders, so the two read as one product.
export const StatusChipStrip = <TValue extends string>({
	chips,
	legend,
	onValueChange,
	value,
	disabled,
}: StatusChipStripProps<TValue>) => (
	<ChipStripScroller>
		{/* Toggle buttons, not tabs: tablist semantics promise arrow-key roving
		    and tabpanels these filter chips don't have. */}
		<fieldset className={CHIP_STRIP_ROW} disabled={disabled}>
			<legend className="sr-only">{legend}</legend>
			{chips.map((chip) => {
				const isActive = value === chip.value;
				return (
					<Button
						aria-pressed={isActive}
						className={cn(CHIP_CLASS, !isActive && "text-foreground")}
						key={chip.value}
						onClick={() => onValueChange(chip.value)}
						type="button"
						variant={isActive ? "default" : "secondary"}
					>
						{chip.color !== undefined && (
							<span
								aria-hidden
								className="size-2 rounded-full"
								style={{ backgroundColor: chip.color }}
							/>
						)}
						{chip.label}
					</Button>
				);
			})}
		</fieldset>
	</ChipStripScroller>
);
