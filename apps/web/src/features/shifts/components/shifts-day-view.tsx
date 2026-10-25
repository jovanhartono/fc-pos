import { Section } from "@/components/section";
import type { Shift } from "@/features/shifts/api";
import { DeleteShiftButton } from "@/features/shifts/components/delete-shift-button";
import { EditShiftButton } from "@/features/shifts/components/edit-shift-button";
import { NoShifts } from "@/features/shifts/components/no-shifts";
import { clockRange, shiftMinutes } from "@/features/shifts/lib/shift-times";
import {
	type PersonRow,
	type StoreGroup,
	sortByStatus,
} from "@/features/shifts/lib/shifts-overview";
import { formatShiftLength } from "@/lib/dayjs";
import { cn } from "@/lib/utils";

interface ShiftsDayViewProps {
	groups: StoreGroup[];
	shifts: Shift[];
}

// One day: who was in at each Store, and on today who is still on shift.
export const ShiftsDayView = ({ groups, shifts }: ShiftsDayViewProps) => {
	return (
		<div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
			{groups.map((group) => (
				<Section key={group.store.id} title={group.store.name}>
					<div className="overflow-hidden rounded-lg border bg-card">
						{group.rows.length === 0 ? (
							<NoShifts />
						) : (
							sortByStatus(group.rows).map((row) => (
								<DayRow
									key={row.person.id}
									row={row}
									shifts={shifts.filter(
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
	);
};

interface DayRowProps {
	row: PersonRow;
	shifts: Shift[];
}

const DayRow = ({ row, shifts }: DayRowProps) => (
	<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 not-first:border-t">
		<span className="flex min-w-0 items-center gap-2.5">
			<span
				aria-hidden
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					row.isOpen ? "bg-success" : "bg-muted-foreground/50",
				)}
			/>
			<span className="min-w-0 text-balance">
				<span className="font-medium text-body">{row.person.name}</span>
				{row.forgotten > 0 ? (
					<span className="ml-2 text-footnote text-tone-bad-foreground">
						Auto-closed
					</span>
				) : null}
			</span>
		</span>
		<DayRowTimes shifts={shifts} />
	</div>
);

interface DayRowTimesProps {
	shifts: Shift[];
}

const DayRowTimes = ({ shifts }: DayRowTimesProps) => {
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
					<DeleteShiftButton shift={shift} />
				</div>
			))}
		</div>
	);
};
