import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { counterQueries } from "@/features/counter/api";
import { CollectedSection } from "@/features/counter/components/day-close/collected-section";
import { DayRow } from "@/features/counter/components/day-close/day-row";
import { DroppedOffSection } from "@/features/counter/components/day-close/dropped-off-section";
import { MethodsSection } from "@/features/counter/components/day-close/methods-section";
import { RefundsSection } from "@/features/counter/components/day-close/refunds-section";
import { jakartaToday } from "@/shared/date-presets";

interface DayCloseTabProps {
	date?: string;
	onDateChange: (date: string | undefined) => void;
	storeId: number;
}

export const DayCloseTab = ({
	date,
	onDateChange,
	storeId,
}: DayCloseTabProps) => {
	const [today, setToday] = useState(jakartaToday);
	// An iPad left on today's close past midnight moves on to the new day.
	useEffect(() => {
		const timer = setInterval(() => setToday(jakartaToday()), 60_000);
		return () => clearInterval(timer);
	}, []);
	// A date after today, from a hand-edited link, falls back to today.
	const day = date && date < today ? date : today;
	const { data, isPending, isError } = useQuery(
		counterQueries.dayClose(storeId, day),
	);

	return (
		<div className="grid max-w-[720px] gap-5 text-sm">
			<DayRow date={day} onDateChange={onDateChange} today={today} />
			{isPending ? <p className="text-muted-foreground">Loading…</p> : null}
			{isError ? (
				<p className="text-destructive">Could not load the day close.</p>
			) : null}
			{data ? (
				<>
					<CollectedSection
						collected={data.collected}
						isToday={day === today}
					/>
					<MethodsSection data={data} />
					<RefundsSection data={data} />
					<DroppedOffSection data={data} />
				</>
			) : null}
		</div>
	);
};
