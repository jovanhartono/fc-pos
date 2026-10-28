import { Clock01Icon, Logout03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	clockOutShift,
	type Shift,
	shiftsQueries,
} from "@/features/shifts/api";
import {
	CLOCK_STATUS_SLOT,
	ClockInControl,
	ClockSkeleton,
	PRIMARY_BUTTON,
} from "@/features/shifts/components/clock-in-control";
import { useCurrentShift } from "@/features/shifts/hooks/useCurrentShift";
import { storesQueries } from "@/features/stores/api";
import { onShiftClocked } from "@/lib/cache-events";
import { formatShiftLength } from "@/lib/dayjs";
import { getCurrentUser } from "@/stores/auth-store";

const currentWeekRange = () => {
	const today = dayjs();
	const daysFromMonday = (today.day() + 6) % 7;
	const monday = today.subtract(daysFromMonday, "day");
	const sunday = monday.add(6, "day");
	return {
		from: monday.format("YYYY-MM-DD"),
		to: sunday.format("YYYY-MM-DD"),
	};
};

export const Route = createFileRoute("/_admin/attendance")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(storesQueries.list()),
	component: AttendancePage,
	// Past a second, the page itself draws with its clock skeleton.
	pendingComponent: AttendancePage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

const formatElapsed = (start: Date, now: Date) => {
	const ms = Math.max(0, now.getTime() - start.getTime());
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

function AttendancePage() {
	const user = getCurrentUser();
	const queryClient = useQueryClient();
	const { data: currentShift, isPending: currentShiftPending } =
		useCurrentShift();
	// Clock in names the nearest Store, so it waits for the Store list too.
	const storesQuery = useQuery(storesQueries.list());
	const [now, setNow] = useState(() => new Date());

	const weekRange = useMemo(() => currentWeekRange(), []);
	const shiftsQuery = useQuery(
		shiftsQueries.list({
			from: weekRange.from,
			to: weekRange.to,
			...(user ? { user_id: user.id } : {}),
		}),
	);

	useEffect(() => {
		if (!currentShift) {
			return;
		}
		const id = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(id);
	}, [currentShift]);

	const clockOutMut = useMutation({
		mutationKey: ["shift-clock-out"],
		mutationFn: clockOutShift,
		onSettled: () => onShiftClocked(queryClient),
	});

	const weekShifts = shiftsQuery.data?.items ?? [];

	return (
		<>
			<PageHeader title="Attendance" />
			<div className="grid w-full gap-8">
				<section className="grid gap-3">
					{currentShiftPending || storesQuery.isPending ? (
						<ClockSkeleton />
					) : currentShift ? (
						<>
							<div className={CLOCK_STATUS_SLOT}>
								<span className="font-semibold text-large-title tabular-nums">
									{formatElapsed(new Date(currentShift.clock_in_at), now)}
								</span>
								<span className="text-muted-foreground text-footnote">
									Since {dayjs(currentShift.clock_in_at).format("HH:mm")}
									{currentShift.store?.code
										? ` · ${currentShift.store.code}`
										: ""}
								</span>
							</div>
							<Button
								className={PRIMARY_BUTTON}
								icon={<HugeiconsIcon icon={Logout03Icon} className="size-5" />}
								loading={clockOutMut.isPending}
								onClick={() => clockOutMut.mutate()}
								size="lg"
								variant="destructive"
							>
								Clock Out
							</Button>
						</>
					) : (
						<ClockInControl />
					)}
				</section>

				<section className="grid gap-2">
					<h2 className="text-subhead font-medium text-muted-foreground tabular-nums">
						{dayjs(weekRange.from).format("DD MMM")} –{" "}
						{dayjs(weekRange.to).format("DD MMM")}
					</h2>
					{shiftsQuery.isPending ? (
						<ul aria-hidden className="divide-y border-y">
							{Array.from({ length: 3 }, (_, index) => (
								<li className="py-2.5" key={index}>
									<Skeleton className="my-0.5 h-4 w-full" />
								</li>
							))}
						</ul>
					) : weekShifts.length === 0 ? (
						<EmptyState icon={Clock01Icon}>No shifts yet.</EmptyState>
					) : (
						<ul className="divide-y border-y">
							{weekShifts.map((shift) => (
								<ShiftRow key={shift.id} shift={shift} />
							))}
						</ul>
					)}
				</section>
			</div>
		</>
	);
}

const ShiftRow = ({ shift }: { shift: Shift }) => (
	<li className="flex items-baseline justify-between gap-3 py-2.5">
		<span className="w-14 shrink-0 text-muted-foreground text-footnote">
			{dayjs(shift.clock_in_at).format("ddd DD")}
		</span>
		<span className="flex-1 truncate text-body tabular-nums">
			{dayjs(shift.clock_in_at).format("HH:mm")} –{" "}
			{shift.clock_out_at ? dayjs(shift.clock_out_at).format("HH:mm") : "…"}
			{shift.auto_closed ? (
				<span className="ml-1.5 text-tone-warn-foreground text-footnote">
					auto-closed
				</span>
			) : null}
		</span>
		<span className="shrink-0 text-muted-foreground text-footnote">
			{shift.store?.code ?? "—"}
		</span>
		<span className="w-16 shrink-0 text-right text-body tabular-nums">
			{shift.clock_out_at
				? formatShiftLength(
						dayjs(shift.clock_out_at).diff(shift.clock_in_at, "minute"),
					)
				: null}
		</span>
	</li>
);
