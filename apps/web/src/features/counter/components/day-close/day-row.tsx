import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { counterQueries } from "@/features/counter/api";
import { DAY_LONG, DAY_SHORT } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import dayjs from "@/lib/dayjs";
import { WIRE_FORMAT } from "@/shared/date-presets";

// Same white box as the date between them, so the three read as one control.
const ARROW_CLASS = "rounded-sm border-border bg-background hover:bg-muted";

interface DayRowProps {
	date: string;
	onDateChange: (date: string | undefined) => void;
	storeId: number;
	today: string;
}

export const DayRow = ({ date, onDateChange, storeId, today }: DayRowProps) => {
	const isMobile = useIsMobile();
	const { isPending, isPlaceholderData } = useQuery(
		counterQueries.dayClose(storeId, date),
	);
	const isToday = date === today;
	const step = (days: number) =>
		dayjs(date).add(days, "day").format(WIRE_FORMAT);
	const handlePick = (next: string | undefined) =>
		onDateChange(next === today ? undefined : next);

	return (
		<div className="flex shrink-0 items-center gap-1">
			<Button
				aria-label="Previous day"
				className={ARROW_CLASS}
				icon={<CaretLeftIcon className="size-4" />}
				onClick={() => handlePick(step(-1))}
				size="icon-lg"
				type="button"
				variant="outline"
			/>
			<DatePicker
				className="w-[5.5rem] text-foreground sm:w-44"
				displayFormat={isMobile ? DAY_SHORT : DAY_LONG}
				isLoading={isPending || isPlaceholderData}
				max={today}
				onChange={handlePick}
				placeholder="Today"
				value={isToday ? undefined : date}
			/>
			<Button
				aria-label="Next day"
				className={ARROW_CLASS}
				disabled={isToday}
				icon={<CaretRightIcon className="size-4" />}
				onClick={() => handlePick(step(1))}
				size="icon-lg"
				type="button"
				variant="outline"
			/>
		</div>
	);
};
