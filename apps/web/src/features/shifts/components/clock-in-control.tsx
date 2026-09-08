import { clockInRequiresLocation } from "@fresclean/api/schema";
import { MapPinIcon, SignInIcon, WarningIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { useGeolocation } from "@/features/shifts/hooks/useGeolocation";
import {
	formatDistanceKm,
	isOutOfClockInRange,
} from "@/features/shifts/lib/distance";
import { invalidateShiftQueries } from "@/features/shifts/lib/shift-cache";
import { clockInShift } from "@/lib/api";
import {
	nearestStoresQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";

const PRIMARY_BUTTON = "h-16 w-full font-semibold text-base uppercase";

export const ClockInControl = () => {
	const queryClient = useQueryClient();
	const user = getCurrentUser();
	const needsLocation = clockInRequiresLocation(user?.role ?? "worker");

	const { status, coordinates, retry } = useGeolocation(needsLocation);
	const storesQuery = useQuery(storesQueryOptions());
	const nearestQuery = useQuery(nearestStoresQueryOptions(coordinates));
	const [picked, setPicked] = useState<string>();

	const clockInMutation = useMutation({
		mutationKey: ["shift-clock-in"],
		mutationFn: clockInShift,
		onSuccess: () => invalidateShiftQueries(queryClient),
	});

	if (status === "locating") {
		return (
			<div className="flex flex-col gap-4">
				<p className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
					<MapPinIcon className="size-3.5" />
					Finding you…
				</p>
				<Button className={PRIMARY_BUTTON} disabled loading size="lg">
					Clock in
				</Button>
			</div>
		);
	}

	if (status === "denied" || status === "unavailable") {
		return (
			<div className="flex flex-col gap-3">
				<div className="flex flex-col items-center gap-1 text-center">
					<p className="flex items-center gap-1.5 font-medium text-destructive text-xs">
						<WarningIcon className="size-3.5" />
						{status === "denied"
							? "Location is off"
							: "Couldn't find your location"}
					</p>
					<p className="text-muted-foreground text-xs">
						{status === "denied"
							? "Turn location on for this site in your browser settings, then try again."
							: "Wait a moment, then try again."}
					</p>
				</div>
				<Button onClick={retry} size="sm" variant="outline">
					Try again
				</Button>
				<Button className={PRIMARY_BUTTON} disabled size="lg">
					Clock in
				</Button>
			</div>
		);
	}

	// A courier is never asked for a location, so they pick a branch the way the
	// rest of the app does.
	const suggestedId = needsLocation
		? nearestQuery.data?.[0]?.id
		: storesQuery.data?.[0]?.id;
	const storeValue =
		picked ?? (suggestedId === undefined ? "" : String(suggestedId));

	const selected = nearestQuery.data?.find(
		(store) => store.id === Number(storeValue),
	);
	const isOutOfRange =
		selected !== undefined && isOutOfClockInRange(selected.distance_km);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col items-center gap-1 text-center">
				{selected ? (
					<>
						<span className="font-medium text-sm">
							{selected.code} · {selected.name}
						</span>
						<span
							className={cn(
								"text-xs",
								isOutOfRange
									? "text-amber-600 dark:text-amber-400"
									: "text-emerald-600 dark:text-emerald-400",
							)}
						>
							{formatDistanceKm(selected.distance_km)} away
						</span>
						{isOutOfRange ? (
							<span className="text-muted-foreground text-xs">
								Your manager will see the distance.
							</span>
						) : null}
					</>
				) : null}

				{picked === undefined && selected ? (
					<button
						className="text-muted-foreground text-xs underline underline-offset-4"
						onClick={() => setPicked(storeValue)}
						type="button"
					>
						change store
					</button>
				) : (
					<div className="w-full text-left">
						<StoreAutocomplete
							id="clock-store"
							onValueChange={setPicked}
							required
							value={storeValue}
						/>
					</div>
				)}
			</div>

			<Button
				className={PRIMARY_BUTTON}
				disabled={!storeValue}
				icon={<SignInIcon className="size-5" weight="duotone" />}
				loading={clockInMutation.isPending}
				onClick={() =>
					clockInMutation.mutate({
						store_id: Number(storeValue),
						...(coordinates ?? {}),
					})
				}
				size="lg"
			>
				Clock in
			</Button>
		</div>
	);
};
