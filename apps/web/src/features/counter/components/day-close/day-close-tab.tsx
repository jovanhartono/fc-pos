import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { counterQueries } from "@/features/counter/api";
import { CollectedSection } from "@/features/counter/components/day-close/collected-section";
import { daySheet } from "@/features/counter/components/day-close/day-sheets";
import { MethodsSection } from "@/features/counter/components/day-close/methods-section";
import { RefundsSection } from "@/features/counter/components/day-close/refunds-section";
import { SalesReportSection } from "@/features/counter/components/day-close/sales-report-section";
import { formatDayLabel } from "@/features/counter/lib/day-close";
import { useSheet } from "@/stores/sheet-store";

interface DayCloseTabProps {
	day: string;
	storeId: number;
	today: string;
}

// While another day loads, the last one stays on screen; only the date
// button's icon spins.
export const DayCloseTab = ({ day, storeId, today }: DayCloseTabProps) => {
	const { data, isError } = useQuery(counterQueries.dayClose(storeId, day));
	const { list } = useSearch({ from: "/_admin/counter" });
	const navigate = useNavigate({ from: "/counter" });

	const setList = (next: string | undefined) =>
		navigate({
			search: (prev) => ({ ...prev, list: next }),
			replace: true,
			resetScroll: false,
		});

	// A phone that went into an Order from a list comes back to the same list.
	// A cashier pressing Back off a list expects it gone, not left over
	// whichever tab Back lands on.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only a new list or day reopens the sheet
	useEffect(() => {
		if (!(list && data) || useSheet.getState().sheetState.open) {
			return;
		}
		const sheet = daySheet(list, data, formatDayLabel(data.date, today));
		if (!sheet) {
			void setList(undefined);
			return;
		}
		useSheet.getState().openSheet({
			...sheet,
			onClose: () => void setList(undefined),
		});
		return () => useSheet.getState().closeSheet();
	}, [list, data?.date]);

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
				onOpen={setList}
			/>
			<MethodsSection data={data} onOpen={setList} />
			<RefundsSection data={data} onOpen={setList} />
			<SalesReportSection data={data} onOpen={setList} />
		</div>
	);
};
