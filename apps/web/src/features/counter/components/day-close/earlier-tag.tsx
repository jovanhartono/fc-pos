import { formatDayShort } from "@/features/counter/lib/day-close";

interface EarlierTagProps {
	createdDay: string;
	date: string;
}

export const EarlierTag = ({ createdDay, date }: EarlierTagProps) =>
	createdDay === date ? null : (
		<span className="ml-1.5 whitespace-nowrap bg-warning/15 px-1.5 text-foreground text-xs">
			Order from {formatDayShort(createdDay)}
		</span>
	);
