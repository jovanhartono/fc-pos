import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkerRow } from "@/features/reports/api";
import { StoreGroup } from "@/features/reports/components/store-group";
import { BadCount } from "@/features/reports/components/tone-chip";
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
import { cn } from "@/lib/utils";

type Live = WorkerRow["live"];

const n = (value: number) => numberFormatter.format(value);

// A Shift left open from an earlier day shows its day, so a forgotten
// clock-out doesn't read as someone who started this morning.
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

interface Column {
	header: string;
	help?: string;
	className?: string;
	cell: (row: WorkerRow) => ReactNode;
}

const columnsFor = (rows: WorkerRow[], now: number): Column[] => {
	const maxPerDay = Math.max(0, ...rows.map((row) => row.per_day_worked ?? 0));
	return [
		{
			header: "Shift",
			className: "text-left",
			cell: (row) =>
				hasShiftLabel(row.live) ? <ShiftLabel live={row.live} /> : <Dash />,
		},
		{
			header: "In hand",
			help: "Items this worker has started and not sent to QC yet — from any day, not only today.",
			cell: (row) => n(row.live.in_hand),
		},
		{
			header: "Last move",
			cell: (row) => sinceText(row.live.last_move_at, now),
		},
		{
			header: "Services",
			className: RANGE_EDGE,
			cell: (row) => n(row.services_processed),
		},
		{ header: "Days", cell: (row) => n(row.days_worked) },
		{
			header: "Avg/day",
			cell: (row) => <AvgBar value={row.per_day_worked} max={maxPerDay} />,
		},
		{
			header: "QC rejects",
			help: "QC checks sent back, out of all QC checks on Items this worker cleaned. One Item can be checked more than once.",
			cell: (row) => <BadCount bad={row.qc_rejects} total={row.qc_checks} />,
		},
		{
			header: "Complaints",
			help: "Complaints, out of Services this worker cleaned that passed QC.",
			cell: (row) => (
				<BadCount bad={row.complaints} total={row.complaint_cohort} />
			),
		},
	];
};

interface ColumnHeaderProps {
	column: Column;
}

const ColumnHeader = ({ column }: ColumnHeaderProps) => {
	if (!column.help) {
		return column.header;
	}
	return (
		<Tooltip>
			<TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
				{column.header}
			</TooltipTrigger>
			<TooltipContent>{column.help}</TooltipContent>
		</Tooltip>
	);
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

interface WorkerListProps {
	rows: WorkerRow[];
	now: number;
	onOpen: (row: WorkerRow) => void;
}

const WorkerList = ({ rows, now, onOpen }: WorkerListProps) => {
	const columns = columnsFor(rows, now);
	return (
		<>
			<table className="hidden w-full text-body tabular-nums lg:table">
				<thead>
					<tr className="bg-muted text-subhead text-muted-foreground">
						<th scope="col" className="w-56 px-4 py-2 text-left font-medium">
							Worker
						</th>
						{columns.map((column) => (
							<th
								key={column.header}
								scope="col"
								className={cn(
									"px-3 py-2 text-right font-medium",
									column.className,
								)}
							>
								<ColumnHeader column={column} />
							</th>
						))}
						<th scope="col" className="w-8">
							<span className="sr-only">Open</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr
							key={row.user_id}
							className="relative border-border border-t hover:bg-muted/40 has-focus-visible:bg-muted/40"
						>
							<td className="px-4 py-2.5">
								{/* The button's own box covers the row, so the whole row opens. */}
								<button
									type="button"
									onClick={() => onOpen(row)}
									className="text-left font-medium after:absolute after:inset-0 focus-visible:outline-none"
								>
									<WorkerName name={row.user_name} role={row.role} />
								</button>
							</td>
							{columns.map((column) => (
								<td
									key={column.header}
									className={cn("px-3 py-2.5 text-right", column.className)}
								>
									{column.cell(row)}
								</td>
							))}
							<td className="pr-3 text-muted-foreground">
								<CaretRightIcon aria-hidden="true" className="size-3.5" />
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<ul className="divide-y divide-border lg:hidden">
				{rows.map((row) => (
					<li key={row.user_id}>
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
									<span className="font-medium">
										{n(row.services_processed)}
									</span>
									<span className="ml-1 text-muted-foreground">
										{row.services_processed === 1 ? "Service" : "Services"}
									</span>
								</span>
								<CaretRightIcon
									aria-hidden="true"
									className="size-3.5 self-center text-muted-foreground"
								/>
							</span>
							<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subhead text-muted-foreground">
								{phoneFacts(row, now)}
								{row.qc_rejects > 0 && (
									<BadCount
										bad={row.qc_rejects}
										total={row.qc_checks}
										prefix="QC "
									/>
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
					</li>
				))}
			</ul>
		</>
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
			{`${isToday ? "No Services today" : "No Services in range"}: ${quiet.map((store) => store.name).join(", ")}`}
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
	// Fixed at mount: the live view re-sorts every minute, and a Store the
	// owner closed must not pop open because another overtook it.
	const [firstStoreId] = useState(() => groupByStore(workers)[0]?.store_id);
	if (workers.length === 0) {
		return (
			<p className="text-muted-foreground text-body">No worker activity</p>
		);
	}

	if (!isAllStores) {
		return (
			<div className="overflow-hidden rounded-lg border bg-card">
				<WorkerList rows={workers} now={now} onOpen={onOpen} />
			</div>
		);
	}

	return (
		<div className="grid gap-2">
			{groupByStore(workers).map(({ store_id, store_name, rows, totals }) => (
				<StoreGroup
					key={store_id}
					storeName={store_name}
					totals={totals}
					isOpenAtStart={store_id === firstStoreId}
				>
					<WorkerList rows={rows} now={now} onOpen={onOpen} />
				</StoreGroup>
			))}
			<QuietStores workers={workers} isToday={isToday} />
		</div>
	);
};
