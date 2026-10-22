import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type FetchShiftsOverviewQuery,
	type Shift,
	shiftsQueries,
} from "@/features/shifts/api";
import { EditShiftButton } from "@/features/shifts/components/edit-shift-button";
import { clockRange, shiftMinutes } from "@/features/shifts/lib/shift-times";
import { buildRow, formatHours } from "@/features/shifts/lib/shifts-overview";
import { storesQueries } from "@/features/stores/api";
import { CONTENT_FADE } from "@/lib/content-fade";
import dayjs, { formatShiftLength, JAKARTA_TZ } from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { WIRE_FORMAT } from "@/shared/date-presets";
import { pluralize } from "@/shared/utils";
import { useSheet } from "@/stores/sheet-store";

export interface WorkerShiftsTarget {
	query: FetchShiftsOverviewQuery;
	userId: number;
	storeId: number;
	name: string;
	role: string;
	storeName: string;
	rangeLabel: string;
}

export const useOpenWorkerShifts = () => {
	const openSheet = useSheet((s) => s.openSheet);
	return useCallback(
		(target: WorkerShiftsTarget) =>
			openSheet({
				title: target.name,
				description: `${target.role} · ${target.storeName} · ${target.rangeLabel}`,
				content: () => <WorkerShiftsContent target={target} />,
			}),
		[openSheet],
	);
};

const jakartaDay = (value: Date | string) =>
	dayjs(value).tz(JAKARTA_TZ).format(WIRE_FORMAT);

interface ShiftLineProps {
	shift: Shift;
}

// One Shift: its times, how long, and Edit for the admin entering real hours.
const ShiftLine = ({ shift }: ShiftLineProps) => {
	const isOpen = shift.clock_out_at === null;
	return (
		<div className="flex items-center gap-3">
			<div className="min-w-0 flex-1 text-subhead tabular-nums">
				<span className="flex items-center gap-2">
					{isOpen ? (
						<span
							aria-hidden
							className="size-1.5 shrink-0 rounded-full bg-success"
						/>
					) : null}
					{clockRange(shift)}
					{shift.auto_closed ? (
						<span className="text-footnote text-tone-bad-foreground">
							Forgotten clock-out
						</span>
					) : null}
				</span>
				{shift.editedBy ? (
					<span className="block text-footnote text-muted-foreground">
						edited by {shift.editedBy.name}
					</span>
				) : null}
			</div>
			<span className="font-medium text-body tabular-nums">
				{formatShiftLength(shiftMinutes(shift))}
			</span>
			<EditShiftButton shift={shift} />
		</div>
	);
};

interface StatProps {
	value: string | number;
	label: string;
}

const Stat = ({ value, label }: StatProps) => (
	<div className="rounded-lg border px-3 py-2.5">
		<span className="block font-medium text-title-2 tabular-nums">{value}</span>
		<span className="text-footnote">{label}</span>
	</div>
);

interface WorkerShiftsContentProps {
	target: WorkerShiftsTarget;
}

const WorkerShiftsContent = ({ target }: WorkerShiftsContentProps) => {
	const overviewQuery = useQuery(shiftsQueries.overview(target.query));
	const storesQuery = useQuery(storesQueries.list());
	const shiftsQuery = useQuery(
		shiftsQueries.ofWorker({
			user_id: target.userId,
			store_id: target.storeId,
			from: target.query.from,
			to: target.query.to,
		}),
	);

	const person = overviewQuery.data?.people.find(
		(candidate) => candidate.id === target.userId,
	);
	const row =
		overviewQuery.data && person
			? buildRow(
					person,
					target.storeId,
					overviewQuery.data.days.filter(
						(day) => day.user_id === target.userId,
					),
					storesQuery.data ?? [],
				)
			: undefined;
	const days = row?.days ?? 0;
	const otherDays = row?.elsewhere ?? [];

	const byDay = new Map<string, Shift[]>();
	for (const shift of shiftsQuery.data ?? []) {
		const day = jakartaDay(shift.clock_in_at);
		const dayShifts = byDay.get(day);
		if (dayShifts) {
			dayShifts.push(shift);
		} else {
			byDay.set(day, [shift]);
		}
	}

	return (
		<div className="grid gap-4">
			<div className="grid auto-cols-fr grid-flow-col gap-2">
				<Stat
					value={days}
					label={`${days === 1 ? "day" : "days"} at ${target.storeName}`}
				/>
				{otherDays.length > 0 ? (
					<Stat value={row?.daysAllStores ?? 0} label="days, all Stores" />
				) : null}
				<Stat value={formatHours(row?.minutes ?? 0)} label="worked" />
			</div>
			{otherDays.length > 0 ? (
				<p className="text-subhead">
					Also{" "}
					{otherDays
						.map(
							(other) =>
								`${pluralize(other.days, "day")} at ${other.storeName}`,
						)
						.join(", ")}
					. The meal fee goes by{" "}
					<strong className="font-medium">
						{pluralize(row?.daysAllStores ?? 0, "day")}
					</strong>
					.
				</p>
			) : null}
			<div className="overflow-hidden rounded-lg border bg-card">
				{shiftsQuery.isPending ? (
					<ShiftDaysSkeleton count={Math.max(1, Math.min(days, 6))} />
				) : (
					<ShiftDays byDay={byDay} />
				)}
			</div>
		</div>
	);
};

interface ShiftDaysProps {
	byDay: Map<string, Shift[]>;
}

const ShiftDays = ({ byDay }: ShiftDaysProps) => {
	if (byDay.size === 0) {
		return <p className="px-3 py-2.5 text-body">No Shifts in this range.</p>;
	}
	return (
		<ul className={CONTENT_FADE}>
			{[...byDay].map(([day, shifts]) => (
				<li key={day} className="grid gap-1.5 px-3 py-2.5 not-first:border-t">
					<div className="flex justify-between text-footnote text-muted-foreground">
						<span>{dayjs(day).format("ddd D MMM")}</span>
						{shifts.length > 1 ? (
							<span>{shifts.length} Shifts · 1 day</span>
						) : null}
					</div>
					{shifts.map((shift) => (
						<ShiftLine key={shift.id} shift={shift} />
					))}
				</li>
			))}
		</ul>
	);
};

interface ShiftDaysSkeletonProps {
	count: number;
}

const ShiftDaysSkeleton = ({ count }: ShiftDaysSkeletonProps) => (
	<ul aria-hidden>
		{Array.from({ length: count }, (_, index) => (
			<li
				key={index}
				className={cn("grid gap-1.5 px-3 py-2.5", index > 0 && "border-t")}
			>
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-7 w-full" />
			</li>
		))}
	</ul>
);
