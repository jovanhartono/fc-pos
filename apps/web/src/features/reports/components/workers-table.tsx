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
import {
	CountBar,
	Pace,
	PersonName,
	paceText,
	ShareBar,
} from "@/features/reports/components/person-cells";
import { StoreGroup } from "@/features/reports/components/store-group";
import { BadCount } from "@/features/reports/components/tone-chip";
import { useStoreCodes } from "@/features/reports/hooks/useStoreCodes";
import { numberFormatter, pluralCount } from "@/features/reports/utils/format";
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

interface ShiftStatusProps {
	live: Live;
}

const ShiftStatus = ({ live }: ShiftStatusProps) => {
	const since = openShiftSince(live);
	if (since) {
		// `relative` lifts the label above the row's click area so its title shows.
		return (
			<span
				title={`Clocked in ${formatClock(since)}`}
				className="relative inline-flex items-center gap-1.5 text-tone-good-foreground"
			>
				<span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
				On shift
			</span>
		);
	}
	// Moving Items today with no Shift means they forgot to clock in.
	if (isMissingClockIn(live)) {
		return <span className="text-tone-bad-foreground">No clock-in</span>;
	}
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				aria-hidden="true"
				className="size-1.5 rounded-full bg-muted-foreground/40"
			/>
			Off
		</span>
	);
};

interface LiveLineProps {
	live: Live;
	now: number;
}

// What the person is doing today, under their name whatever range is chosen.
const LiveLine = ({ live, now }: LiveLineProps) => {
	const isAtWork = openShiftSince(live) !== null || isMissingClockIn(live);
	const facts = [
		isAtWork || live.in_hand > 0 ? `${n(live.in_hand)} in hand` : null,
		live.last_move_at ? `moved ${sinceText(live.last_move_at, now)} ago` : null,
	].filter(Boolean);
	return (
		<span className="text-muted-foreground text-subhead tabular-nums">
			<ShiftStatus live={live} />
			{facts.map((fact) => ` · ${fact}`).join("")}
		</span>
	);
};

interface HelpHeaderProps {
	label: string;
	help: string;
}

export const HelpHeader = ({ label, help }: HelpHeaderProps) => (
	<Tooltip>
		<TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
			{label}
		</TooltipTrigger>
		<TooltipContent>{help}</TooltipContent>
	</Tooltip>
);

const columnsFor = (
	maxServices: number,
	now: number,
): DataTableColumnDef<WorkerRow>[] => [
	{
		accessorKey: "user_name",
		header: "Worker",
		meta: { width: { percent: 40, minRem: 14 } },
		cell: ({ row }) => (
			<PersonName
				name={row.original.user_name}
				detail={<LiveLine live={row.original.live} now={now} />}
			>
				<WorkerName name={row.original.user_name} role={row.original.role} />
			</PersonName>
		),
	},
	{
		id: "services",
		header: "Services",
		meta: { align: "right", width: { percent: 18, minRem: 6 } },
		cell: ({ row }) => (
			<CountBar value={row.original.services_processed} max={maxServices} />
		),
	},
	{
		id: "pace",
		header: "Pace",
		meta: { align: "right", width: { percent: 14, minRem: 5.5 } },
		cell: ({ row }) => (
			<Pace
				perDay={row.original.per_day_worked}
				days={row.original.days_worked}
			/>
		),
	},
	{
		id: "qc_rejects",
		header: () => (
			<HelpHeader
				label="QC rejects"
				help="QC checks sent back on Items this worker cleaned. One Item can be sent back more than once."
			/>
		),
		meta: { align: "right", width: { percent: 12, minRem: 5 } },
		cell: ({ row }) => (
			<BadCount bad={row.original.qc_rejects} total={row.original.qc_checks} />
		),
	},
	{
		id: "complaints",
		header: () => (
			<HelpHeader
				label="Complaints"
				help="Complaints on Services this worker cleaned that passed QC."
			/>
		),
		meta: { align: "right", width: { percent: 12, minRem: 5.5 } },
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
		cell: () => <OpenArrow />,
	},
];

export const OpenArrow = () => (
	<HugeiconsIcon
		icon={ArrowRight01Icon}
		aria-hidden="true"
		className="size-3.5 text-muted-foreground"
	/>
);

interface WorkerCardProps {
	row: WorkerRow;
	now: number;
	maxServices: number;
	onOpen: (row: WorkerRow) => void;
}

const WorkerCard = ({ row, now, maxServices, onOpen }: WorkerCardProps) => (
	<button
		type="button"
		onClick={() => onOpen(row)}
		className="grid w-full gap-2 px-4 py-3 text-left text-body tabular-nums active:bg-muted/40"
	>
		<span className="flex items-center gap-2">
			<span className="min-w-0 flex-1">
				<PersonName
					name={row.user_name}
					detail={<LiveLine live={row.live} now={now} />}
				>
					<WorkerName name={row.user_name} role={row.role} />
				</PersonName>
			</span>
			<span>
				<span className="font-medium">{n(row.services_processed)}</span>
				<span className="ml-1 text-muted-foreground">
					{row.services_processed === 1 ? "Service" : "Services"}
				</span>
			</span>
			<OpenArrow />
		</span>
		<ShareBar value={row.services_processed} max={maxServices} />
		<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subhead text-muted-foreground">
			{`${paceText(row.per_day_worked)} · ${pluralCount(row.days_worked, "day")}`}
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
	maxServices: number;
	onOpen: (row: WorkerRow) => void;
	isInsideCard?: boolean;
}

const WorkerList = ({
	rows,
	now,
	maxServices,
	onOpen,
	isInsideCard,
}: WorkerListProps) => {
	const columns = useMemo(
		() => columnsFor(maxServices, now),
		[maxServices, now],
	);
	return (
		<DataTable
			emptyIcon={UserGroupIcon}
			columns={columns}
			data={rows}
			onRowOpen={onOpen}
			isInsideCard={isInsideCard}
			renderCard={(row) => (
				<WorkerCard
					now={now}
					maxServices={maxServices}
					onOpen={onOpen}
					row={row}
				/>
			)}
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
	// One scale across every Store, so bars compare between groups too.
	const maxServices = Math.max(
		0,
		...workers.map((row) => row.services_processed),
	);

	if (!isAllStores) {
		return (
			<WorkerList
				rows={workers}
				now={now}
				maxServices={maxServices}
				onOpen={onOpen}
			/>
		);
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
					<WorkerList
						rows={rows}
						now={now}
						maxServices={maxServices}
						onOpen={onOpen}
						isInsideCard
					/>
				</StoreGroup>
			))}
			<QuietStores workers={workers} isToday={isToday} />
		</div>
	);
};
