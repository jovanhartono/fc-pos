import { Tag } from "@/features/counter/components/day-close/order-row";
import { formatDayShort } from "@/features/counter/lib/day-close";

interface EarlierTagProps {
	createdDay: string;
	date: string;
}

export const EarlierTag = ({ createdDay, date }: EarlierTagProps) =>
	createdDay === date ? null : (
		<Tag tone="amber">Order from {formatDayShort(createdDay)}</Tag>
	);
