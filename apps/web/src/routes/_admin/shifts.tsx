import {
	type Icon,
	PlusIcon,
	SignInIcon,
	SignOutIcon,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { useCallback, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { DateTimeCell } from "@/components/date-time-cell";
import { EditRowButton } from "@/components/edit-row-button";
import { ListPanel } from "@/components/list-panel";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-picker";
import { StoreSelect } from "@/features/orders/components/store-select";
import { type Shift, shiftsQueries } from "@/features/shifts/api";
import { EditShiftForm } from "@/features/shifts/components/edit-shift-form";
import { NewShiftForm } from "@/features/shifts/components/new-shift-form";
import { storesQueries } from "@/features/stores/api";
import { formatShiftLength } from "@/lib/dayjs";
import { useDialog } from "@/stores/dialog-store";

const PAGE_SIZE = 25;

const shiftsSearchSchema = z.object({
	from: z.string().optional().catch(undefined),
	page: z.coerce.number().int().positive().catch(1),
	store_id: z.coerce.number().int().positive().optional().catch(undefined),
	to: z.string().optional().catch(undefined),
});

const buildShiftsQuery = (search: z.infer<typeof shiftsSearchSchema>) => ({
	limit: PAGE_SIZE,
	offset: (search.page - 1) * PAGE_SIZE,
	...(search.from ? { from: search.from } : {}),
	...(search.to ? { to: search.to } : {}),
	...(search.store_id !== undefined ? { store_id: search.store_id } : {}),
});

export const Route = createFileRoute("/_admin/shifts")({
	validateSearch: (search) => shiftsSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps, cause }) => {
		// Paging or a new store or range keeps the page up and swaps the rows.
		if (cause === "stay") {
			return;
		}
		await Promise.all([
			context.queryClient.ensureQueryData(
				shiftsQueries.list(buildShiftsQuery(deps)),
			),
			context.queryClient.ensureQueryData(storesQueries.list()),
		]);
	},
	component: ShiftsPage,
	// Past a second, the page itself draws with skeleton rows.
	pendingComponent: ShiftsPage,
	codeSplitGroupings: [["component", "pendingComponent"]],
});

interface OpenShiftProps {
	clockInAt: Date | string;
}

const OpenShift = ({ clockInAt }: OpenShiftProps) => (
	<span className="font-medium text-tone-good-foreground">
		Open
		<span className="block font-normal text-foreground">
			since {dayjs(clockInAt).format("HH:mm")}
		</span>
	</span>
);

interface ClockLabelProps {
	icon: Icon;
	text: string;
}

const ClockLabel = ({ icon: LabelIcon, text }: ClockLabelProps) => (
	<>
		<LabelIcon aria-hidden className="size-4" />
		<span className="sr-only">{text}</span>
	</>
);

interface ShiftDurationProps {
	shift: Shift;
}

const ShiftDuration = ({ shift }: ShiftDurationProps) => (
	<div className="flex flex-col gap-0.5 text-subhead">
		{shift.clock_out_at ? (
			<span className="font-medium tabular-nums">
				{formatShiftLength(
					dayjs(shift.clock_out_at).diff(shift.clock_in_at, "minute"),
				)}
			</span>
		) : (
			<OpenShift clockInAt={shift.clock_in_at} />
		)}
		{shift.auto_closed ? (
			<span className="text-tone-warn-foreground text-footnote">
				auto-closed
			</span>
		) : null}
		{shift.editedBy ? (
			<span className="text-muted-foreground text-footnote">
				edited by {shift.editedBy.name}
			</span>
		) : null}
	</div>
);

function ShiftsPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const search = Route.useSearch();
	const shiftsQuery = useQuery({
		...shiftsQueries.list(buildShiftsQuery(search)),
		placeholderData: keepPreviousData,
	});
	const shifts = shiftsQuery.data?.items ?? [];
	const openDialog = useDialog((s) => s.openDialog);
	const closeDialog = useDialog((s) => s.closeDialog);

	const handleEdit = useCallback(
		(shift: Shift) => {
			openDialog({
				title: "Edit shift",
				description: `${shift.user?.name ?? `User #${shift.user_id}`} · ${shift.store?.code ?? ""}`,
				content: () => <EditShiftForm shift={shift} onDone={closeDialog} />,
			});
		},
		[openDialog, closeDialog],
	);

	const handleCreate = () => {
		openDialog({
			title: "New shift",
			content: () => <NewShiftForm onDone={closeDialog} />,
		});
	};

	const columns = useMemo<DataTableColumnDef<Shift>[]>(
		() => [
			{
				id: "user",
				header: "Worker",
				meta: { width: { percent: 33, minRem: 9 } },
				cell: ({ row }) => (
					<div className="flex flex-col text-subhead">
						<span className="font-medium text-body">
							{row.original.user?.name ?? `User #${row.original.user_id}`}
							{/* The card has no Store column, so the store rides on the name. */}
							<span className="ml-1.5 font-normal text-subhead tabular-nums lg:hidden">
								{row.original.store?.code}
							</span>
						</span>
						<span className="font-normal capitalize">
							{row.original.user?.role ?? ""}
						</span>
					</div>
				),
			},
			{
				id: "store",
				header: "Store",
				meta: {
					width: { percent: 10, minRem: 4 },
					mobileCard: { slot: "hidden" },
				},
				cell: ({ row }) => (
					<span className="text-subhead">
						{row.original.store?.code ?? "-"}
					</span>
				),
			},
			{
				id: "clock_in",
				header: "Clock in",
				meta: {
					width: { percent: 16, minRem: 6.5 },
					mobileCard: {
						label: <ClockLabel icon={SignInIcon} text="Clock in" />,
						valueClassName: "font-normal",
					},
				},
				cell: ({ row }) => (
					<div className="text-subhead">
						<DateTimeCell value={row.original.clock_in_at} />
					</div>
				),
			},
			{
				id: "clock_out",
				header: "Clock out",
				meta: {
					width: { percent: 16, minRem: 6.5 },
					mobileCard: {
						label: <ClockLabel icon={SignOutIcon} text="Clock out" />,
						valueClassName: "font-normal",
					},
				},
				cell: ({ row }) => (
					<div className="text-subhead">
						{row.original.clock_out_at ? (
							<DateTimeCell value={row.original.clock_out_at} />
						) : (
							"—"
						)}
					</div>
				),
			},
			{
				id: "duration",
				header: "Duration",
				// pt-1 matches the card title, which drops 4px to line up with Edit buttons.
				meta: {
					width: { percent: 15, minRem: 6 },
					mobileCard: { slot: "title-end", className: "pt-1 text-right" },
				},
				cell: ({ row }) => <ShiftDuration shift={row.original} />,
			},
			{
				id: "actions",
				header: "Actions",
				meta: {
					width: { percent: 10, minRem: 4.5 },
					mobileCard: { slot: "title-end" },
				},
				cell: ({ row }) => (
					<EditRowButton onClick={() => handleEdit(row.original)} />
				),
			},
		],
		[handleEdit],
	);

	return (
		<>
			<PageHeader
				title="Shifts"
				count={shiftsQuery.data?.meta.total}
				countNoun="shift"
				actions={
					<Button icon={<PlusIcon className="size-4" />} onClick={handleCreate}>
						New shift
					</Button>
				}
			/>
			<ListPanel>
				<div className="flex flex-wrap items-center gap-2">
					<StoreSelect
						id="shifts-store"
						hideLabel
						value={search.store_id?.toString() ?? ""}
						onValueChange={(value) => {
							void navigate({
								search: (prev) => ({
									...prev,
									page: 1,
									store_id: value ? Number(value) : undefined,
								}),
							});
						}}
						allOptionLabel="All stores"
						placeholder="Filter by store"
						triggerClassName="sm:w-60"
					/>
					<DateRangePicker
						commitOnComplete
						id="shifts-range"
						from={search.from}
						to={search.to}
						onChange={({ from, to }) => {
							void navigate({
								search: (prev) => ({
									...prev,
									from: from ?? undefined,
									page: 1,
									to: to ?? undefined,
								}),
							});
						}}
					/>
				</div>
				<DataTable
					columns={columns}
					data={shifts}
					isLoading={shiftsQuery.isPending}
					isStale={shiftsQuery.isPlaceholderData}
					filterKey={JSON.stringify(search)}
					skeletonCardClassName="h-22.5"
					footer={
						<TablePagination
							meta={shiftsQuery.data?.meta}
							isLoading={shiftsQuery.isPending}
							onPageChange={(page) => {
								void navigate({
									search: (prev) => ({ ...prev, page }),
								});
							}}
						/>
					}
				/>
			</ListPanel>
		</>
	);
}
