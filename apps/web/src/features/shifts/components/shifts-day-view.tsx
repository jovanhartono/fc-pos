import { Section } from "@/components/section";
import { Skeleton } from "@/components/ui/skeleton";
import type { Shift } from "@/features/shifts/api";
import { EditShiftButton } from "@/features/shifts/components/edit-shift-button";
import {
	ForgottenNote,
	SummaryLine,
	SummaryValue,
} from "@/features/shifts/components/shifts-summary";
import { clockRange, shiftMinutes } from "@/features/shifts/lib/shift-times";
import {
	type PersonRow,
	type StoreGroup,
	summarizeGroups,
} from "@/features/shifts/lib/shifts-overview";
import { formatShiftLength } from "@/lib/dayjs";
import { cn } from "@/lib/utils";

interface ShiftsDayViewProps {
	groups: StoreGroup[];
	shifts: Shift[] | undefined;
	isToday: boolean;
}

// One day: who was in at each Store, and on today who is still on shift.
export const ShiftsDayView = ({
	groups,
	shifts,
	isToday,
}: ShiftsDayViewProps) => {
	const totals = summarizeGroups(groups);
	const listed = new Set(
		groups.flatMap((group) => group.rows.map((row) => row.person.id)),
	);
	const notIn = listed.size - totals.people;

	return (
		<div className="grid gap-4">
			<SummaryLine>
				{isToday ? (
					<SummaryValue value={totals.onShiftNow} label="on shift now" />
				) : null}
				<SummaryValue
					value={totals.people}
					label={isToday ? "clocked in today" : "clocked in"}
				/>
				<SummaryValue value={notIn} label="not in" />
				<ForgottenNote count={totals.forgotten} />
			</SummaryLine>
			<div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
				{groups.map((group) => (
					<Section
						key={group.store.id}
						title={group.store.name}
						count={`${group.rows.filter((row) => row.days > 0).length} in`}
					>
						<div className="overflow-hidden rounded-lg border bg-card">
							{group.rows.length === 0 ? (
								<p className="px-3 py-2.5 text-body">No one on this Store.</p>
							) : (
								group.rows.map((row) => (
									<DayRow
										key={row.person.id}
										row={row}
										shifts={shifts?.filter(
											(shift) =>
												shift.user_id === row.person.id &&
												shift.store_id === group.store.id,
										)}
									/>
								))
							)}
						</div>
					</Section>
				))}
			</div>
		</div>
	);
};

interface DayRowProps {
	row: PersonRow;
	shifts: Shift[] | undefined;
}

const DayRow = ({ row, shifts }: DayRowProps) => {
	const isIn = row.days > 0;
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 not-first:border-t">
			<span className="flex min-w-0 items-center gap-2.5">
				<span
					aria-hidden
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						row.isOpen ? "bg-success" : "bg-muted-foreground/50",
						!isIn && "opacity-60",
					)}
				/>
				<span className="min-w-0">
					<span
						className={cn(
							"font-medium text-body",
							!isIn && "font-normal text-muted-foreground",
						)}
					>
						{row.person.name}
					</span>
					<span className="ml-1.5 text-muted-foreground text-subhead">
						{row.person.role}
					</span>
					{row.forgotten > 0 ? (
						<span className="ml-2 text-footnote text-tone-bad-foreground">
							Forgotten clock-out
						</span>
					) : null}
				</span>
			</span>
			<DayRowTimes isIn={isIn} shifts={shifts} />
		</div>
	);
};

interface DayRowTimesProps {
	isIn: boolean;
	shifts: Shift[] | undefined;
}

const DayRowTimes = ({ isIn, shifts }: DayRowTimesProps) => {
	if (!isIn) {
		return (
			<span className="text-muted-foreground text-subhead">No clock-in</span>
		);
	}
	if (!shifts) {
		return <Skeleton className="h-7 w-40" />;
	}
	return (
		<div className="grid gap-2">
			{shifts.map((shift) => (
				<div key={shift.id} className="flex items-center justify-end gap-3">
					<span className="text-right text-subhead tabular-nums whitespace-nowrap">
						<span className="block font-medium text-body">
							{formatShiftLength(shiftMinutes(shift))}
						</span>
						{clockRange(shift)}
					</span>
					<EditShiftButton shift={shift} />
				</div>
			))}
		</div>
	);
};
