import { clockInRequiresLocation, distanceKm } from "@fresclean/api/schema";
import { SignInIcon, WarningIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import { clockInShift } from "@/features/shifts/api";
import { useGeolocation } from "@/features/shifts/hooks/useGeolocation";
import { formatDistanceKm } from "@/features/shifts/lib/distance";
import { type Store, storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { onShiftClocked } from "@/lib/cache-events";
import { readServerErrorMessage } from "@/lib/server-error";
import { getCurrentUser } from "@/stores/auth-store";

export const PRIMARY_BUTTON =
	"h-16 w-full font-semibold text-base uppercase tracking-[0.18em]";

export const ClockInControl = () => {
	const queryClient = useQueryClient();
	const user = getCurrentUser();
	const needsLocation = clockInRequiresLocation(user?.role ?? "worker");

	const { status, coordinates, retry } = useGeolocation(needsLocation);
	const storesQuery = useQuery(storesQueries.list());
	const meQuery = useQuery({ ...usersQueries.me(), enabled: Boolean(user) });
	const [picked, setPicked] = useState<string>();

	const clockInMutation = useMutation({
		mutationKey: ["shift-clock-in"],
		mutationFn: clockInShift,
		onSuccess: () => onShiftClocked(queryClient),
		// Opt out of the global error toast (main.tsx): a worker turned away for
		// being too far needs the reason on screen while they walk to the store,
		// not a toast that has gone by the time they look up.
		onError: () => undefined,
	});

	// Branches this person is actually assigned to. Preselecting one they are not
	// only hands them a 403 with no clue which branch to pick instead.
	const allowedStoreIds = useMemo(
		() =>
			meQuery.data === undefined || meQuery.data.role === "admin"
				? undefined
				: (meQuery.data.userStores?.map((item) => item.store_id) ?? []),
		[meQuery.data],
	);

	// Closest branch first, measured with the server's own formula so the branch
	// offered is the one the server measures against a moment later. A courier is
	// never asked for a location, so their list stays unsorted.
	const ranked = useMemo((): { km?: number; store: Store }[] => {
		const open = (storesQuery.data ?? []).filter(
			(store) =>
				store.is_active &&
				(allowedStoreIds === undefined || allowedStoreIds.includes(store.id)),
		);

		if (!coordinates) {
			return open.map((store) => ({ store }));
		}

		return open
			.map((store) => ({
				store,
				km: distanceKm(coordinates, {
					latitude: Number(store.latitude),
					longitude: Number(store.longitude),
				}),
			}))
			.sort((a, b) => a.km - b.km);
	}, [storesQuery.data, allowedStoreIds, coordinates]);

	if (status === "locating") {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-muted-foreground text-xs" role="status">
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
				<div className="flex items-start gap-1.5" role="alert">
					<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
					<p className="text-xs">
						<span className="font-medium text-destructive">
							{status === "denied"
								? "Location is off"
								: "Couldn't find your location"}
						</span>
						<br />
						<span className="text-muted-foreground">
							{status === "denied"
								? "Turn it on for this site, then try again."
								: "Wait a moment, then try again."}
						</span>
					</p>
				</div>
				<Button
					className="self-start"
					onClick={retry}
					size="sm"
					variant="outline"
				>
					Try again
				</Button>
				<Button className={PRIMARY_BUTTON} disabled size="lg">
					Clock in
				</Button>
			</div>
		);
	}

	const storeValue = picked ?? (ranked[0] ? String(ranked[0].store.id) : "");
	const entry = ranked.find(({ store }) => store.id === Number(storeValue));
	const selected = entry?.store;
	const selectedKm = entry?.km;

	return (
		<div className="flex flex-col gap-3">
			{picked === undefined && selected ? (
				<div className="flex flex-col items-start gap-0.5">
					<div className="flex w-full items-baseline justify-between gap-3">
						<span className="truncate font-medium text-sm">
							{selected.name}
						</span>
						{selectedKm === undefined ? null : (
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatDistanceKm(selectedKm)}
							</span>
						)}
					</div>
					<button
						className="text-muted-foreground text-xs underline underline-offset-4"
						onClick={() => setPicked(storeValue)}
						type="button"
					>
						change
					</button>
				</div>
			) : (
				<StoreAutocomplete
					allowedStoreIds={allowedStoreIds}
					id="clock-store"
					onValueChange={(value) => {
						// A worker turned away from Kemang who switches to BSD must not
						// keep reading the refusal that named Kemang.
						clockInMutation.reset();
						setPicked(value);
					}}
					required
					value={storeValue}
				/>
			)}

			{clockInMutation.isError ? (
				<p
					className="flex items-start gap-1.5 text-destructive text-xs"
					role="alert"
				>
					<WarningIcon className="mt-0.5 size-3.5 shrink-0" />
					{readServerErrorMessage(
						clockInMutation.error,
						"Could not clock you in",
					)}
				</p>
			) : null}

			<Button
				className={PRIMARY_BUTTON}
				disabled={!storeValue}
				icon={<SignInIcon className="size-5" weight="duotone" />}
				loading={clockInMutation.isPending}
				onClick={() =>
					clockInMutation.mutate({
						store_id: Number(storeValue),
						coordinates,
					})
				}
				size="lg"
			>
				Clock in
			</Button>
		</div>
	);
};
