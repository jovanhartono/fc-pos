import { ClockIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useCurrentShift } from "@/features/shifts/hooks/useCurrentShift";
import { clockInShift, clockOutShift, queryKeys, type Store } from "@/lib/api";

const formatElapsed = (start: Date, now: Date) => {
	const ms = Math.max(0, now.getTime() - start.getTime());
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

interface ShiftClockCardProps {
	stores: Store[];
}

export const ShiftClockCard = ({ stores }: ShiftClockCardProps) => {
	const queryClient = useQueryClient();
	const { data: currentShift, isPending } = useCurrentShift();
	const [storeOverride, setStoreOverride] = useState<string | null>(null);
	const [now, setNow] = useState(() => new Date());

	const selectedStoreId =
		storeOverride ?? (stores[0] ? String(stores[0].id) : "");

	useEffect(() => {
		if (!currentShift) {
			return;
		}
		const interval = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(interval);
	}, [currentShift]);

	const invalidateShiftQueries = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.shiftCurrent }),
			queryClient.invalidateQueries({ queryKey: ["shifts"] }),
		]);

	const clockInMutation = useMutation({
		mutationKey: ["shift-clock-in"],
		mutationFn: clockInShift,
		onSuccess: invalidateShiftQueries,
	});

	const clockOutMutation = useMutation({
		mutationKey: ["shift-clock-out"],
		mutationFn: clockOutShift,
		onSuccess: invalidateShiftQueries,
	});

	if (isPending) {
		return null;
	}

	if (currentShift) {
		const elapsed = formatElapsed(new Date(currentShift.clock_in_at), now);
		return (
			<div className="flex items-center gap-2 border border-border/70 px-2 py-1 text-xs">
				<ClockIcon className="size-4 text-emerald-500" />
				<span className="hidden font-mono tabular-nums sm:inline">
					{elapsed}
				</span>
				<span className="hidden text-muted-foreground md:inline">
					{currentShift.store?.code ?? ""}
				</span>
				<Button
					size="sm"
					variant="outline"
					disabled={clockOutMutation.isPending}
					onClick={() => clockOutMutation.mutate()}
				>
					Clock out
				</Button>
			</div>
		);
	}

	if (stores.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-2">
			{stores.length > 1 ? (
				<Select
					value={selectedStoreId}
					onValueChange={(value) => setStoreOverride(value ?? null)}
				>
					<SelectTrigger size="sm" className="h-8 min-w-24 text-xs">
						<SelectValue placeholder="Store" />
					</SelectTrigger>
					<SelectContent>
						{stores.map((store) => (
							<SelectItem key={store.id} value={String(store.id)}>
								{store.code}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : null}
			<Button
				size="sm"
				variant="outline"
				disabled={!selectedStoreId || clockInMutation.isPending}
				icon={<ClockIcon className="size-4" />}
				onClick={() =>
					clockInMutation.mutate({ store_id: Number(selectedStoreId) })
				}
			>
				Clock in
			</Button>
		</div>
	);
};
