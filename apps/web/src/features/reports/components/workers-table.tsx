import { ArrowRight01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { EmptyState } from "@/components/empty-state";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkerRow } from "@/features/reports/api";
import { StoreGroup } from "@/features/reports/components/store-group";
import { BadCount } from "@/features/reports/components/tone-chip";
import { useStoreCodes } from "@/features/reports/hooks/useStoreCodes";
import {
	numberFormatter,
	oneDecimalFormatter,
} from "@/features/reports/utils/format";
import {
	groupByStore,
	isMissingClockIn,
	openShiftSince,
	sinceText,
} from "@/features/reports/utils/workers-report";
import { storesQueries } from "@/features/stores/api";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

type Live = WorkerRow["live"];

const n = (value: number) => numberFormatter.format(value);

// A Shift left open from an earlier day shows its day, so a worker who never
// clocked out doesn't read as someone who started this morning.
const formatClock = (value: string) => {
	const at = dayjs(value).tz(JAKARTA_TZ);
	return at.isSame(dayjs().tz(JAKARTA_TZ), "day")
		? at.format("HH:mm")
		: at.format("D MMM HH:mm");
};

interface WorkerNameProps {
	name: string;
	role: string;
}

export const WorkerName = ({ name, role }: WorkerNameProps) => (
	<>
		{name}
		{role !== "worker" && (
			<span className="ml-1.5 font-normal text-subhead text-muted-foreground">
				{role}
			</span>
		)}
	</>
);

interface ShiftLabelProps {
	live: Live;
}

// Only On and No clock-in say anything; an empty Shift cell is a dash.
const hasShiftLabel = (live: Live) =>
	openShiftSince(live) !== null || isMissingClockIn(live);

// `relative` lifts the label above the row's click area so its title shows.
const ShiftLabel = ({ live }: ShiftLabelProps) => {
	const since = openShiftSince(live);
	if (since) {
		return (
			<span
				title={`Clocked in ${formatClock(since)}`}
				className="relative inline-flex items-center gap-1.5 font-normal text-tone-good-foreground"
			>
				<span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
				On
			</span>
		);
	}
	return (
		<span className="font-normal text-tone-bad-foreground">No clock-in</span>
	);
};

const Dash = () => <span className="text-muted-foreground">—</span>;

interface AvgBarProps {
	value: number | null;
	max: number;
}

// Scaled to the busiest Avg/day in the same table, so rows compare by eye.
const AvgBar = ({ value, max }: AvgBarProps) => (
	<span className="inline-flex items-center justify-end gap-2">
		<span
			aria-hidden="true"
			className="h-1.5 w-11 overflow-hidden rounded-full bg-soft-bar-track"
		>
			<span
				className="block h-full rounded-full bg-soft-bar"
				style={{ width: `${max > 0 && value ? (value / max) * 100 : 0}%` }}
			/>
		</span>
		<span className="w-8 text-right">
			{value === null ? "—" : oneDecimalFormatter.format(value)}
		</span>
	</span>
);

// The line between what is happening right now and the chosen date range.
const RANGE_EDGE = "shadow-[inset_1px_0_0_var(--color-border)]";

interface HelpHeaderProps {
	label: string;
	help: string;
}

const HelpHeader = ({ label, help }: HelpHeaderProps) => (
	<Tooltip>
		<TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
			{label}
		</TooltipTrigger>
		<TooltipContent>{help}</TooltipContent>
	</Tooltip>
);

const columnsFor = (
	rows: WorkerRow[],
	now: number,
): DataTableColumnDef<WorkerRow>[] => {
	const maxPerDay = Math.max(0, ...rows.map((row) => row.per_day_worked ?? 0));
	return [
		{
			accessorKey: "user_name",
			header: "Worker",
			meta: { kind: "name", width: { percent: 21, minRem: 8 } },
			cell: ({ row }) => (
				<WorkerName name={row.original.user_name} role={row.original.role} />
			),
		},
		{
			id: "shift",
			header: "Shift",
			meta: { width: { percent: 9, minRem: 3.5 } },
			cell: ({ row }) =>
				hasShiftLabel(row.original.live) ? (
					<ShiftLabel live={row.original.live} />
				) : (
					<Dash />
				),
		},
		{
			id: "in_hand",
			header: () => (
				<HelpHeader
					label="In hand"
					help="Items this worker has started and not sent to QC yet — from any day, not only today."
				/>
			),
			meta: { align: "right", width: { percent: 8, minRem: 3.5 } },
			cell: ({ row }) => n(row.original.live.in_hand),
		},
		{
			id: "last_move",
			header: "Last move",
			meta: { align: "right", width: { percent: 10, minRem: 4 } },
			cell: ({ row }) => sinceText(row.original.live.last_move_at, now),
		},
		{
			id: "services",
			header: "Services",
			meta: {
				align: "right",
				width: { percent: 9, minRem: 3.75 },
				// Keeps the header's own hairline underneath.
				headerClassName:
					"shadow-[inset_1px_0_0_var(--color-border),inset_0_-1px_0_var(--border)]",
				cellClassName: RANGE_EDGE,
			},
			cell: ({ row }) => n(row.original.services_processed),
		},
		{
			id: "days",
			header: "Days",
			meta: { align: "right", width: { percent: 6, minRem: 2.5 } },
			cell: ({ row }) => n(row.original.days_worked),
		},
		{
			id: "per_day",
			header: "Avg/day",
			meta: { align: "right", width: { percent: 13, minRem: 5.5 } },
			cell: ({ row }) => (
				<AvgBar value={row.original.per_day_worked} max={maxPerDay} />
			),
		},
		{
			id: "qc_rejects",
			header: () => (
				<HelpHeader
					label="QC rejects"
					help="QC checks sent back, out of all QC checks on Items this worker cleaned. One Item can be checked more than once."
				/>
			),
			meta: { align: "right", width: { percent: 10, minRem: 4.5 } },
			cell: ({ row }) => (
				<BadCount
					bad={row.original.qc_rejects}
					total={row.original.qc_checks}
				/>
			),
		},
		{
			id: "complaints",
			header: () => (
				<HelpHeader
					label="Complaints"
					help="Complaints, out of Services this worker cleaned that passed QC."
				/>
			),
			meta: { align: "right", width: { percent: 10, minRem: 4.5 } },
			cell: ({ row }) => (
				<BadCount
					bad={row.original.complaints}
					total={row.original.complaint_cohort}
				/>
			),
		},
		{
			id: "open",
			header: () => <span className="sr-only">Open</span>,
			meta: { width: { percent: 4, minRem: 1.75 } },
			cell: () => (
				<HugeiconsIcon
					icon={ArrowRight01Icon}
					aria-hidden="true"
					className="size-3.5 text-muted-foreground"
				/>
			),
		},
	];
};

const phoneFacts = (row: WorkerRow, now: number) => {
	const moved = row.live.last_move_at
		? `moved ${sinceText(row.live.last_move_at, now)} ago`
		: "no move today";
	const perDay =
		row.per_day_worked === null
			? []
			: [`${oneDecimalFormatter.format(row.per_day_worked)}/day`];
	return [...perDay, `${n(row.live.in_hand)} in hand`, moved].join(" · ");
};

interface WorkerCardProps {
	row: WorkerRow;
	now: number;
	onOpen: (row: WorkerRow) => void;
}

const WorkerCard = ({ row, now, onOpen }: WorkerCardProps) => (
	<button
		type="button"
		onClick={() => onOpen(row)}
		className="grid w-full gap-1 px-4 py-3 text-left text-body tabular-nums active:bg-muted/40"
	>
		<span className="flex items-baseline gap-2">
			<span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 font-medium">
				<span>
					<WorkerName name={row.user_name} role={row.role} />
				</span>
				{hasShiftLabel(row.live) && (
					<span className="text-subhead">
						<ShiftLabel live={row.live} />
					</span>
				)}
			</span>
			<span>
				<span className="font-medium">{n(row.services_processed)}</span>
				<span className="ml-1 text-muted-foreground">
					{row.services_processed === 1 ? "Service" : "Services"}
				</span>
			</span>
			<HugeiconsIcon
				icon={ArrowRight01Icon}
				aria-hidden="true"
				className="size-3.5 self-center text-muted-foreground"
			/>
		</span>
		<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subhead text-muted-foreground">
			{phoneFacts(row, now)}
			{row.qc_rejects > 0 && (
				<BadCount bad={row.qc_rejects} total={row.qc_checks} prefix="QC " />
			)}
			{row.complaints > 0 && (
				<BadCount
					bad={row.complaints}
					total={row.complaint_cohort}
					prefix="Complaints "
				/>
			)}
		</span>
	</button>
);

interface WorkerListProps {
	rows: WorkerRow[];
	now: number;
	onOpen: (row: WorkerRow) => void;
	isInsideCard?: boolean;
}

const WorkerList = ({ rows, now, onOpen, isInsideCard }: WorkerListProps) => {
	const columns = useMemo(() => columnsFor(rows, now), [rows, now]);
	return (
		<DataTable
			emptyIcon={UserGroupIcon}
			columns={columns}
			data={rows}
			onRowOpen={onOpen}
			isInsideCard={isInsideCard}
			renderCard={(row) => <WorkerCard now={now} onOpen={onOpen} row={row} />}
		/>
	);
};

interface QuietStoresProps {
	workers: WorkerRow[];
	isToday: boolean;
}

// Every Store without a row folds into one line, so a quiet booth costs the
// owner no scrolling.
const QuietStores = ({ workers, isToday }: QuietStoresProps) => {
	const { data: stores = [] } = useQuery(storesQueries.list());
	const busy = new Set(workers.map((row) => row.store_id));
	const quiet = stores.filter(
		(store) => store.is_active && !busy.has(store.id),
	);
	if (quiet.length === 0) {
		return null;
	}
	return (
		<p className="rounded-lg border bg-card px-4 py-3 text-muted-foreground text-body">
			{`${isToday ? "No Services today" : "No Services in range"}: ${quiet.map((store) => store.code).join(", ")}`}
		</p>
	);
};

interface WorkersTableProps {
	workers: WorkerRow[];
	isAllStores: boolean;
	isToday: boolean;
	onOpen: (row: WorkerRow) => void;
}

// One table on every date range: what each person is doing right now on the
// left, the chosen range on the right.
export const WorkersTable = ({
	workers,
	isAllStores,
	isToday,
	onOpen,
}: WorkersTableProps) => {
	const now = useMinuteClock();
	const storeCodes = useStoreCodes();
	// Fixed at mount: the live view re-sorts every minute, and a Store the
	// owner closed must not pop open because another overtook it.
	const [firstStoreId] = useState(() => groupByStore(workers)[0]?.store_id);
	if (workers.length === 0) {
		return <EmptyState icon={UserGroupIcon}>No worker activity</EmptyState>;
	}

	if (!isAllStores) {
		return <WorkerList rows={workers} now={now} onOpen={onOpen} />;
	}

	return (
		<div className="grid gap-2">
			{groupByStore(workers).map(({ store_id, store_name, rows, totals }) => (
				<StoreGroup
					key={store_id}
					storeCode={storeCodes.get(store_id) ?? store_name}
					totals={totals}
					isOpenAtStart={store_id === firstStoreId}
				>
					<WorkerList rows={rows} now={now} onOpen={onOpen} isInsideCard />
				</StoreGroup>
			))}
			<QuietStores workers={workers} isToday={isToday} />
		</div>
	);
};
