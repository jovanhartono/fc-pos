import { Badge } from "@/components/ui/badge";
import { formatDayShort } from "@/features/counter/lib/day-close";

interface EarlierTagProps {
	createdDay: string;
	date: string;
}

export const EarlierTag = ({ createdDay, date }: EarlierTagProps) =>
	createdDay === date ? null : (
		<Badge variant="warning">Order from {formatDayShort(createdDay)}</Badge>
	);
