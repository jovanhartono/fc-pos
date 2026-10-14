import { useQuery } from "@tanstack/react-query";
import { counterQueries } from "@/features/counter/api";
import { CollectedSection } from "@/features/counter/components/day-close/collected-section";
import { MethodsSection } from "@/features/counter/components/day-close/methods-section";
import { RefundsSection } from "@/features/counter/components/day-close/refunds-section";
import { SalesReportSection } from "@/features/counter/components/day-close/sales-report-section";
import { formatDayLabel } from "@/features/counter/lib/day-close";

interface DayCloseTabProps {
	day: string;
	storeId: number;
	today: string;
}

// While another day loads, the last one stays on screen; only the date
// button's icon spins.
export const DayCloseTab = ({ day, storeId, today }: DayCloseTabProps) => {
	const { data, isError } = useQuery(counterQueries.dayClose(storeId, day));

	if (!data) {
		return isError ? (
			<p className="text-destructive">Could not load the day close.</p>
		) : null;
	}

	const dayLabel = formatDayLabel(data.date, today);

	return (
		<div className="grid max-w-[720px] gap-5 text-sm">
			{isError ? (
				<p className="text-destructive">Could not refresh the day close.</p>
			) : null}
			<CollectedSection
				data={data}
				dayLabel={dayLabel}
				isToday={data.date === today}
			/>
			<MethodsSection data={data} />
			<RefundsSection data={data} />
			<SalesReportSection data={data} dayLabel={dayLabel} />
		</div>
	);
};
