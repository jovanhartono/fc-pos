import { SignOutIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
	clockOutShift,
	type Shift,
	shiftsQueries,
} from "@/features/shifts/api";
import {
	ClockInControl,
	PRIMARY_BUTTON,
} from "@/features/shifts/components/clock-in-control";
import { useCurrentShift } from "@/features/shifts/hooks/useCurrentShift";
import { storesQueries } from "@/features/stores/api";
import { onShiftClocked } from "@/lib/cache-events";
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

const formatDuration = (clockIn: string, clockOut: string) => {
	const totalMinutes = Math.max(
		0,
		Math.floor(dayjs(clockOut).diff(dayjs(clockIn)) / 60_000),
	);
	return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
};

function AttendancePage() {
	const user = getCurrentUser();
	const queryClient = useQueryClient();
	const { data: currentShift, isPending: currentShiftPending } =
		useCurrentShift();
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
		onSuccess: () => onShiftClocked(queryClient),
	});

	const weekShifts = shiftsQuery.data?.items ?? [];

	return (
		<>
			<PageHeader title="Attendance" />
			<div className="mx-auto grid w-full max-w-md gap-8">
				<section className="grid gap-3">
					{currentShiftPending ? (
						<>
							<span className="h-12 w-40 animate-pulse bg-muted" />
							<span className="h-16 w-full animate-pulse bg-muted" />
						</>
					) : currentShift ? (
						<>
							<div className="grid gap-0.5">
								<span className="font-mono font-semibold text-5xl tabular-nums">
									{formatElapsed(new Date(currentShift.clock_in_at), now)}
								</span>
								<span className="text-muted-foreground text-xs">
									Since {dayjs(currentShift.clock_in_at).format("HH:mm")}
									{currentShift.store?.code
										? ` · ${currentShift.store.code}`
										: ""}
								</span>
							</div>
							<Button
								className={PRIMARY_BUTTON}
								icon={<SignOutIcon className="size-5" weight="duotone" />}
								loading={clockOutMut.isPending}
								onClick={() => clockOutMut.mutate()}
								size="lg"
								variant="destructive"
							>
								Clock out
							</Button>
						</>
					) : (
						<ClockInControl />
					)}
				</section>

				<section className="grid gap-2">
					<h2 className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
						{dayjs(weekRange.from).format("DD MMM")} –{" "}
						{dayjs(weekRange.to).format("DD MMM")}
					</h2>
					{shiftsQuery.isPending ? (
						<p className="text-muted-foreground text-sm">Loading…</p>
					) : weekShifts.length === 0 ? (
						<p className="text-muted-foreground text-sm">No shifts yet.</p>
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
		<span className="w-14 shrink-0 text-muted-foreground text-xs">
			{dayjs(shift.clock_in_at).format("ddd DD")}
		</span>
		<span className="flex-1 truncate text-sm tabular-nums">
			{dayjs(shift.clock_in_at).format("HH:mm")} –{" "}
			{shift.clock_out_at ? dayjs(shift.clock_out_at).format("HH:mm") : "…"}
		</span>
		<span className="shrink-0 text-muted-foreground text-xs">
			{shift.store?.code ?? "—"}
		</span>
		<span className="w-16 shrink-0 text-right text-sm tabular-nums">
			{shift.clock_out_at
				? formatDuration(shift.clock_in_at, shift.clock_out_at)
				: null}
		</span>
	</li>
);
