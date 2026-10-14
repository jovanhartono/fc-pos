import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import dayjs from "@/lib/dayjs";
import { WIRE_FORMAT } from "@/shared/date-presets";

interface DayRowProps {
	date: string;
	onDateChange: (date: string | undefined) => void;
	today: string;
}

export const DayRow = ({ date, onDateChange, today }: DayRowProps) => {
	const isToday = date === today;
	const step = (days: number) =>
		dayjs(date).add(days, "day").format(WIRE_FORMAT);
	const handlePick = (next: string | undefined) =>
		onDateChange(next === today ? undefined : next);

	return (
		<div className="flex items-center gap-1.5">
			<Button
				aria-label="Previous day"
				icon={<CaretLeftIcon className="size-4" />}
				onClick={() => handlePick(step(-1))}
				size="icon"
				type="button"
				variant="outline"
			/>
			<DatePicker
				className="min-w-44 text-foreground max-sm:flex-1"
				max={today}
				onChange={handlePick}
				placeholder="Today"
				value={isToday ? undefined : date}
			/>
			<Button
				aria-label="Next day"
				disabled={isToday}
				icon={<CaretRightIcon className="size-4" />}
				onClick={() => handlePick(step(1))}
				size="icon"
				type="button"
				variant="outline"
			/>
		</div>
	);
};
