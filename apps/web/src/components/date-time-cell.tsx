import dayjs from "dayjs";

interface DateTimeCellProps {
	value: Date | string;
	dateFormat?: string;
}

// Date over a grey time in the table, one line in the phone card's header.
export const DateTimeCell = ({
	value,
	dateFormat = "DD MMM YYYY",
}: DateTimeCellProps) => {
	const date = dayjs(value);
	return (
		<div className="flex gap-1.5 lg:flex-col lg:gap-0">
			<span>{date.format(dateFormat)}</span>
			<span className="lg:text-muted-foreground lg:text-xs">
				{date.format("HH:mm")}
			</span>
		</div>
	);
};
