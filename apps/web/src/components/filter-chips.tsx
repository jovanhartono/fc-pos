import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { getPresets, matchPreset } from "@/shared/date-presets";

export interface FilterChip {
	id: string;
	label: string;
	onRemove: () => void;
}

interface FilterChipsProps {
	chips: FilterChip[];
	className?: string;
}

// Says which filters are set behind the Filters button, each one tap from gone.
// Hidden on a phone, where the row would push the list below the fold; the
// count on the button says filters are set.
export const FilterChips = ({ chips, className }: FilterChipsProps) => (
	<ul
		aria-label="Filters in use"
		className={cn("hidden flex-wrap gap-2 md:flex", className)}
	>
		{chips.map((chip) => (
			<li key={chip.id}>
				<button
					type="button"
					aria-label={`Remove ${chip.label}`}
					onClick={chip.onRemove}
					className="inline-flex h-7 items-center gap-1 rounded-full bg-primary/10 pr-2 pl-3 font-medium text-footnote text-primary transition-colors hover:bg-primary/15 pointer-coarse:h-9"
				>
					{chip.label}
					<HugeiconsIcon
						icon={Cancel01Icon}
						className="size-3.5 text-primary/70"
					/>
				</button>
			</li>
		))}
	</ul>
);

const formatDay = (day: string) => dayjs(day).format("MMM D, YYYY");

// Same words as the date button: the preset's name, else the dates. A link
// with only one end filters from or until that day, not on it.
export const dateRangeLabel = (from?: string, to?: string) => {
	if (from && to) {
		return (
			matchPreset(getPresets(), from, to)?.label ??
			`${formatDay(from)} - ${formatDay(to)}`
		);
	}
	return from ? `From ${formatDay(from)}` : `Until ${formatDay(to ?? "")}`;
};
