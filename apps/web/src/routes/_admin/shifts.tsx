import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StoreSelect } from "@/features/orders/components/store-select";
import { withPresetRange } from "@/features/reports/utils/report-filters";
import { shiftsQueries } from "@/features/shifts/api";
import { NewShiftForm } from "@/features/shifts/components/new-shift-form";
import { ShiftsDayView } from "@/features/shifts/components/shifts-day-view";
import { ShiftsRangeControl } from "@/features/shifts/components/shifts-range-control";
import { ShiftsRangeView } from "@/features/shifts/components/shifts-range-view";
import { useOpenWorkerShifts } from "@/features/shifts/components/worker-shifts-sheet";
import {
	buildStoreGroups,
	listDays,
	type PersonRow,
	rangeLabel,
	type ShiftsRange,
	type StoreGroup,
} from "@/features/shifts/lib/shifts-overview";
import { storesQueries } from "@/features/stores/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { staleFade } from "@/lib/content-fade";
import {
	DATE_PRESETS,
	type DatePreset,
	getPresets,
	jakartaToday,
	matchPreset,
} from "@/shared/date-presets";
import { useDialog } from "@/stores/dialog-store";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const shiftsSearchSchema = z.object({
	preset: z.enum(DATE_PRESETS).optional().catch(undefined),
	from: z.string().regex(dateRegex).optional().catch(undefined),
	to: z.string().regex(dateRegex).optional().catch(undefined),
	store_id: z.coerce.number().int().positive().optional().catch(undefined),
});

type ShiftsSearch = z.infer<typeof shiftsSearchSchema>;

// The admin opens Shifts to see who is in today; totals are a preset away.
const SHIFTS_PRESET: DatePreset = "today";

const resolveSearch = (search: ShiftsSearch) => {
	const { preset, from, to } = withPresetRange(search, SHIFTS_PRESET);
	// A hand-edited link with its dates reversed shows the end day.
	const range: ShiftsRange = { from: from > to ? to : from, to };
	return { range, preset };
};

const overviewQuery = (range: ShiftsRange, storeId: number | undefined) => ({
	...range,
	...(storeId === undefined ? {} : { store_id: storeId }),
});

const dayShiftsQuery = (range: ShiftsRange, storeId: number | undefined) => ({
	from: range.from,
	to: range.from,
	store_id: storeId,
	limit: 100,
});

const ShiftsSkeleton = () => (
	<div aria-hidden className="grid gap-4">
		<Skeleton className="h-6 w-72" />
		<Skeleton className="h-4 w-96 max-w-full" />
		{[0, 1].map((group) => (
			<div key={group} className="grid gap-2.5">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-64 w-full rounded-lg" />
			</div>
		))}
	</div>
);

const ShiftsPage = () => {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const isPhone = useIsMobile();
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);
	const openWorkerShifts = useOpenWorkerShifts();

	const today = jakartaToday();
	const { range, preset } = resolveSearch(search);
	const isSingleDay = range.from === range.to;
	const query = overviewQuery(range, search.store_id);

	const overview = useQuery({
		...shiftsQueries.overview(query),
		placeholderData: keepPreviousData,
	});
	const storesQuery = useQuery(storesQueries.list());
	const dayShifts = useQuery({
		...shiftsQueries.list(dayShiftsQuery(range, search.store_id)),
		enabled: isSingleDay,
	});

	const groups = useMemo(
		() =>
			overview.data
				? buildStoreGroups(
						overview.data,
						storesQuery.data ?? [],
						search.store_id,
					)
				: [],
		[overview.data, storesQuery.data, search.store_id],
	);
	const presetLabel = matchPreset(
		getPresets(),
		range.from,
		range.to,
		preset,
	)?.label;

	const handleOpen = (row: PersonRow, group: StoreGroup) =>
		openWorkerShifts({
			query,
			userId: row.person.id,
			storeId: group.store.id,
			name: row.person.name,
			role: row.person.role,
			storeName: group.store.name,
			rangeLabel: rangeLabel(range, presetLabel),
		});

	const setRange = (next: ShiftsRange) => {
		const isDefault =
			matchPreset(getPresets(), next.from, next.to)?.id === SHIFTS_PRESET;
		void navigate({
			search: (prev) => ({
				...prev,
				preset: undefined,
				from: isDefault ? undefined : next.from,
				to: isDefault ? undefined : next.to,
			}),
		});
	};

	const setPreset = (preset: DatePreset) =>
		void navigate({
			search: (prev) => ({
				...prev,
				preset: preset === SHIFTS_PRESET ? undefined : preset,
				from: undefined,
				to: undefined,
			}),
		});

	const handleCreate = () =>
		openDialog({
			title: "New shift",
			content: () => <NewShiftForm onDone={closeDialog} />,
		});

	return (
		<>
			<PageHeader
				title="Shifts"
				actions={
					<Button
						icon={<HugeiconsIcon className="size-4" icon={Add01Icon} />}
						onClick={handleCreate}
					>
						New shift
					</Button>
				}
			/>
			<div className="mb-5 flex flex-wrap items-center gap-2">
				<StoreSelect
					id="shifts-store"
					hideLabel
					value={search.store_id?.toString() ?? ""}
					onValueChange={(value) => {
						void navigate({
							search: (prev) => ({
								...prev,
								store_id: value ? Number(value) : undefined,
							}),
						});
					}}
					allOptionLabel="All stores"
					placeholder="All stores"
					triggerClassName="sm:w-60"
				/>
				<span className="flex-1" />
				<ShiftsRangeControl
					range={range}
					preset={preset}
					today={today}
					onRangeChange={setRange}
					onPresetChange={setPreset}
				/>
			</div>
			{overview.data ? (
				<div className={staleFade(overview.isPlaceholderData)}>
					{isSingleDay ? (
						<ShiftsDayView groups={groups} shifts={dayShifts.data?.items} />
					) : (
						<ShiftsRangeView
							groups={groups}
							days={listDays(range)}
							today={today}
							isPhone={isPhone}
							onOpen={handleOpen}
						/>
					)}
				</div>
			) : (
				<ShiftsSkeleton />
			)}
		</>
	);
};

export const Route = createFileRoute("/_admin/shifts")({
	validateSearch: (search) => shiftsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps, cause }) => {
		// A new Store or range keeps the page up and swaps the numbers.
		if (cause === "stay") {
			return;
		}
		const { range } = resolveSearch(deps);
		await Promise.all([
			context.queryClient.ensureQueryData(
				shiftsQueries.overview(overviewQuery(range, deps.store_id)),
			),
			context.queryClient.ensureQueryData(storesQueries.list()),
			range.from === range.to
				? context.queryClient.ensureQueryData(
						shiftsQueries.list(dayShiftsQuery(range, deps.store_id)),
					)
				: undefined,
		]);
	},
	component: ShiftsPage,
	// Past a second, the page itself draws with placeholders.
	pendingComponent: ShiftsPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});
