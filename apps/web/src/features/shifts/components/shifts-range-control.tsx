import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import {
	type ShiftsRange,
	stepRange,
} from "@/features/shifts/lib/shifts-overview";
import type { DatePreset } from "@/shared/date-presets";

// Same white box as the dates between them, so the three read as one control.
const ARROW_CLASS = "rounded-sm border-border bg-background hover:bg-muted";

interface ShiftsRangeControlProps {
	range: ShiftsRange;
	preset?: DatePreset;
	today: string;
	isLoading: boolean;
	onRangeChange: (range: ShiftsRange) => void;
	onPresetChange: (preset: DatePreset) => void;
}

export const ShiftsRangeControl = ({
	range,
	preset,
	today,
	isLoading,
	onRangeChange,
	onPresetChange,
}: ShiftsRangeControlProps) => (
	<div className="flex items-center gap-1 max-sm:w-full">
		<Button
			aria-label="Earlier"
			className={ARROW_CLASS}
			icon={<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />}
			onClick={() => onRangeChange(stepRange(range, -1, today, preset))}
			size="icon"
			type="button"
			variant="outline"
		/>
		<DateRangePicker
			id="shifts-range"
			className="min-w-0 text-foreground max-sm:flex-1 sm:w-64"
			commitOnComplete
			isLoading={isLoading}
			from={range.from}
			to={range.to}
			preset={preset}
			onChange={(next) => {
				if (next.preset) {
					onPresetChange(next.preset);
					return;
				}
				if (next.from && next.to) {
					onRangeChange({ from: next.from, to: next.to });
				}
			}}
		/>
		<Button
			aria-label="Later"
			className={ARROW_CLASS}
			disabled={range.to >= today}
			icon={<HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />}
			onClick={() => onRangeChange(stepRange(range, 1, today, preset))}
			size="icon"
			type="button"
			variant="outline"
		/>
	</div>
);
