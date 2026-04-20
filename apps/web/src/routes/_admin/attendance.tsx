import { ClockIcon, SignInIcon, SignOutIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { useCurrentShift } from "@/features/shifts/hooks/useCurrentShift";
import { clockInShift, clockOutShift, queryKeys, type Shift } from "@/lib/api";
import { shiftsQueryOptions, storesQueryOptions } from "@/lib/query-options";
import { cn } from "@/lib/utils";
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
		context.queryClient.ensureQueryData(storesQueryOptions()),
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

const formatDuration = (
	clockIn: Date | string,
	clockOut: Date | string | null,
) => {
	if (!clockOut) {
		return "Open";
	}
	const ms = dayjs(clockOut).diff(dayjs(clockIn));
	const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours}h ${String(minutes).padStart(2, "0")}m`;
};

function AttendancePage() {
	const user = getCurrentUser();
	const queryClient = useQueryClient();
	const { data: currentShift, isPending: currentShiftPending } =
		useCurrentShift();
	const storesQuery = useQuery(storesQueryOptions());
	const stores = storesQuery.data ?? [];
	const [storeValue, setStoreValue] = useState("");
	const [now, setNow] = useState(() => new Date());

	const weekRange = useMemo(() => currentWeekRange(), []);
	const shiftsQuery = useQuery(
		shiftsQueryOptions({
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

	useEffect(() => {
		if (!storeValue && stores[0]) {
			setStoreValue(String(stores[0].id));
		}
	}, [stores, storeValue]);

	const invalidate = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.shiftCurrent }),
			queryClient.invalidateQueries({ queryKey: ["shifts"] }),
		]);

	const clockInMut = useMutation({
		mutationKey: ["shift-clock-in"],
		mutationFn: clockInShift,
		onSuccess: invalidate,
	});

	const clockOutMut = useMutation({
		mutationKey: ["shift-clock-out"],
		mutationFn: clockOutShift,
		onSuccess: invalidate,
	});

	const onShift = Boolean(currentShift);
	const elapsed = currentShift
		? formatElapsed(new Date(currentShift.clock_in_at), now)
		: null;
	const weekShifts = shiftsQuery.data ?? [];

	return (
		<>
			<PageHeader title="Attendance" />
			<div className="mx-auto grid w-full max-w-md gap-4">
				<Card
					className={cn(
						"overflow-hidden",
						onShift &&
							"border-emerald-500/40 bg-emerald-500/5 dark:border-emerald-400/30 dark:bg-emerald-400/5",
					)}
				>
					<CardContent className="flex flex-col items-stretch gap-5 py-8">
						<div className="flex flex-col items-center gap-2">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em]",
									onShift
										? "text-emerald-600 dark:text-emerald-400"
										: "text-muted-foreground",
								)}
							>
								<span
									className={cn(
										"size-1.5",
										currentShiftPending
											? "animate-pulse bg-muted-foreground/40"
											: onShift
												? "animate-pulse bg-emerald-500"
												: "bg-muted-foreground/60",
									)}
									aria-hidden="true"
								/>
								{currentShiftPending
									? "Checking…"
									: onShift
										? "On shift"
										: "Off shift"}
							</span>
							{currentShiftPending ? (
								<>
									<span className="h-12 w-40 animate-pulse bg-muted" />
									<span className="h-3 w-32 animate-pulse bg-muted/70" />
								</>
							) : onShift && elapsed ? (
								<>
									<span className="font-mono font-semibold text-5xl tabular-nums">
										{elapsed}
									</span>
									<span className="text-muted-foreground text-xs">
										Since{" "}
										{dayjs(currentShift?.clock_in_at).format("DD MMM HH:mm")}
										{currentShift?.store?.code
											? ` · ${currentShift.store.code}`
											: ""}
									</span>
								</>
							) : (
								<>
									<span className="font-mono font-semibold text-5xl tabular-nums text-transparent select-none">
										00:00:00
									</span>
									<span className="text-muted-foreground text-xs">
										Ready when you are.
									</span>
								</>
							)}
						</div>

						{!currentShiftPending && !onShift && stores.length > 0 ? (
							<StoreAutocomplete
								id="clock-store"
								value={storeValue}
								onValueChange={setStoreValue}
								required
							/>
						) : null}

						<Button
							size="lg"
							variant={onShift ? "destructive" : "default"}
							className="h-16 w-full text-base font-semibold uppercase tracking-[0.18em]"
							icon={
								onShift ? (
									<SignOutIcon className="size-5" weight="duotone" />
								) : (
									<SignInIcon className="size-5" weight="duotone" />
								)
							}
							loading={
								currentShiftPending ||
								clockInMut.isPending ||
								clockOutMut.isPending
							}
							loadingText={currentShiftPending ? "Checking…" : undefined}
							disabled={currentShiftPending || (!onShift && !storeValue)}
							onClick={() => {
								if (onShift) {
									clockOutMut.mutate();
									return;
								}
								if (!storeValue) {
									return;
								}
								clockInMut.mutate({ store_id: Number(storeValue) });
							}}
						>
							{onShift ? "Clock out" : "Clock in"}
						</Button>
					</CardContent>
				</Card>

				<div className="grid gap-2">
					<div className="flex items-baseline justify-between px-1">
						<h2 className="font-semibold text-xs uppercase tracking-[0.2em]">
							This week
						</h2>
						<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
							{dayjs(weekRange.from).format("DD MMM")} –{" "}
							{dayjs(weekRange.to).format("DD MMM")}
						</span>
					</div>
					{shiftsQuery.isPending ? (
						<Card>
							<CardContent className="py-6 text-center text-muted-foreground text-sm">
								Loading…
							</CardContent>
						</Card>
					) : weekShifts.length === 0 ? (
						<Card>
							<CardContent className="py-8 text-center text-muted-foreground text-sm">
								No shifts yet this week.
							</CardContent>
						</Card>
					) : (
						<div className="grid gap-2">
							{weekShifts.map((shift) => (
								<ShiftRow key={shift.id} shift={shift} />
							))}
						</div>
					)}
				</div>
			</div>
		</>
	);
}

function ShiftRow({ shift }: { shift: Shift }) {
	const open = !shift.clock_out_at;
	return (
		<Card>
			<CardContent className="flex items-center justify-between gap-3 py-3">
				<div className="flex min-w-0 items-center gap-3">
					<div
						className={cn(
							"flex size-10 shrink-0 flex-col items-center justify-center border",
							open
								? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
								: "border-border bg-muted text-foreground",
						)}
					>
						<span className="text-[9px] uppercase tracking-[0.14em]">
							{dayjs(shift.clock_in_at).format("ddd")}
						</span>
						<span className="font-semibold text-xs leading-none">
							{dayjs(shift.clock_in_at).format("DD")}
						</span>
					</div>
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-medium text-sm tabular-nums">
							{dayjs(shift.clock_in_at).format("HH:mm")} –{" "}
							{shift.clock_out_at
								? dayjs(shift.clock_out_at).format("HH:mm")
								: "…"}
						</span>
						<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<ClockIcon className="size-3" />
							{shift.store?.code ?? "—"}
						</span>
					</div>
				</div>
				<Badge variant={open ? "success" : "outline"}>
					{formatDuration(shift.clock_in_at, shift.clock_out_at)}
				</Badge>
			</CardContent>
		</Card>
	);
}
