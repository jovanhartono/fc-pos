import { Analytics01Icon } from "@hugeicons/core-free-icons";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { SectionTitle } from "@/components/section";
import { Card, CardContent } from "@/components/ui/card";
import type { FinancialReport } from "@/features/reports/api";
import { compactMoney } from "@/features/reports/utils/format";
import { cn } from "@/lib/utils";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A date's place in WEEKDAYS; dayjs runs without the isoWeek plugin.
export const mondayFirst = (date: string | dayjs.Dayjs) =>
	(dayjs(date).day() + 6) % 7;

// How many of each weekday the range holds.
export const weekdayCounts = (from: string, to: string) => {
	const counts = WEEKDAYS.map(() => 0);
	const end = dayjs(to);
	for (let day = dayjs(from); !day.isAfter(end); day = day.add(1, "day")) {
		counts[mondayFirst(day)] += 1;
	}
	return counts;
};

interface BusyHoursCardProps {
	rows: FinancialReport["busy_hours"];
	from: string;
	to: string;
}

interface Slot {
	weekday: number;
	hour: number;
}

// An hour with under this share of the range's money doesn't widen the grid:
// one QRIS paid from the Track page at 01:00 would add eight empty columns.
const MIN_HOUR_SHARE = 0.01;

// Which hours of which weekdays the counter takes money: darker is more.
// An owner uses it to decide who works the Saturday evening shift.
export const BusyHoursCard = ({ rows, from, to }: BusyHoursCardProps) => {
	const counts = weekdayCounts(from, to);
	// Per day, so five Mondays in the range don't look busier than four Saturdays.
	const cells = rows
		.filter((row) => row.collected > 0 && counts[row.weekday] > 0)
		.map((row) => ({ ...row, average: row.collected / counts[row.weekday] }));
	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid content-start gap-4 p-4">
				<SectionTitle title="Busy Hours" />
				{cells.length === 0 ? (
					<EmptyState icon={Analytics01Icon}>No data in range.</EmptyState>
				) : (
					<BusyGrid cells={cells} />
				)}
			</CardContent>
		</Card>
	);
};

interface BusyCell extends Slot {
	collected: number;
	average: number;
}

interface BusyGridProps {
	cells: BusyCell[];
}

const BusyGrid = ({ cells }: BusyGridProps) => {
	const [picked, setPicked] = useState<Slot | null>(null);
	const tableRef = useRef<HTMLTableElement>(null);
	// A tapped hour stays on show until the next tap elsewhere; an iPhone
	// never blurs a tapped button, so the page listens instead.
	useEffect(() => {
		const clearOutside = (event: PointerEvent) => {
			if (!tableRef.current?.contains(event.target as Node)) {
				setPicked(null);
			}
		};
		window.addEventListener("pointerdown", clearOutside);
		return () => window.removeEventListener("pointerdown", clearOutside);
	}, []);

	const total = cells.reduce((sum, cell) => sum + cell.collected, 0);
	const hourTotals = new Map<number, number>();
	for (const cell of cells) {
		hourTotals.set(
			cell.hour,
			(hourTotals.get(cell.hour) ?? 0) + cell.collected,
		);
	}
	const open = [...hourTotals]
		.filter(([, sum]) => sum >= total * MIN_HOUR_SHARE)
		.map(([hour]) => hour);
	const first = Math.min(...open);
	const last = Math.max(...open);
	const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
	const shownCells = cells.filter(
		(cell) => cell.hour >= first && cell.hour <= last,
	);
	const amount = (slot: Slot) =>
		shownCells.find(
			(cell) => cell.weekday === slot.weekday && cell.hour === slot.hour,
		)?.average ?? 0;
	const busiest = shownCells.reduce((a, b) => (b.average > a.average ? b : a));
	const shown = picked ?? busiest;
	return (
		<>
			<div className="grid gap-0.5">
				<p className="text-footnote text-muted-foreground">
					{picked ? "Average" : "Busiest"} · {WEEKDAYS[shown.weekday]}{" "}
					{shown.hour}:00
				</p>
				<p className="text-title-1 tabular-nums">
					{compactMoney(amount(shown))}
				</p>
			</div>
			<table
				className="w-full table-fixed border-separate border-spacing-0.5 text-footnote tabular-nums"
				ref={tableRef}
			>
				<thead>
					<tr>
						<th className="w-9" scope="col">
							<span className="sr-only">Day</span>
						</th>
						{hours.map((hour) => (
							<th
								// A phone has room for every other hour's label.
								className={cn(
									"pb-1 text-center font-normal text-muted-foreground",
									hour % 2 === 1 && "max-sm:invisible",
								)}
								key={hour}
								scope="col"
							>
								{hour}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{WEEKDAYS.map((day, weekday) => (
						<tr key={day}>
							<th
								className="text-left font-normal text-muted-foreground"
								scope="row"
							>
								{day}
							</th>
							{hours.map((hour) => {
								const value = amount({ weekday, hour });
								return (
									<td className="p-0" key={hour}>
										{/* Out of the Tab order: a hundred cells would stand
										    between a keyboard user and the next card. */}
										<button
											aria-label={`${day} ${hour}:00, ${compactMoney(value)}`}
											className="block h-7 w-full rounded-[calc(var(--radius-sm)-4px)] pointer-coarse:h-8"
											onClick={() => setPicked({ weekday, hour })}
											onPointerEnter={(event) =>
												event.pointerType === "mouse" &&
												setPicked({ weekday, hour })
											}
											onPointerLeave={(event) =>
												event.pointerType === "mouse" && setPicked(null)
											}
											style={{
												backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(
													6 + (value / busiest.average) * 94,
												)}%, var(--card))`,
											}}
											tabIndex={-1}
											type="button"
										/>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
};
