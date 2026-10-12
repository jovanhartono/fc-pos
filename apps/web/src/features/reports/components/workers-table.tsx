import { CaretRightIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import type { WorkerRow } from "@/features/reports/api";
import { StoreGroup } from "@/features/reports/components/store-group";
import {
	ComplaintsChip,
	QcChip,
} from "@/features/reports/components/tone-chip";
import {
	numberFormatter,
	oneDecimalFormatter,
} from "@/features/reports/utils/format";
import { groupByStore } from "@/features/reports/utils/workers-report";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";

type Live = NonNullable<WorkerRow["live"]>;

const n = (value: number) => numberFormatter.format(value);

// A Shift left open from an earlier day shows its day, so a forgotten
// clock-out doesn't read as someone who started this morning.
const formatClock = (value: string) => {
	const at = dayjs(value).tz(JAKARTA_TZ);
	return at.isSame(dayjs().tz(JAKARTA_TZ), "day")
		? at.format("HH:mm")
		: at.format("D MMM HH:mm");
};

const onShiftText = (live: Live | null) => {
	if (!live?.clock_in_at) {
		return "—";
	}
	if (!live.clock_out_at) {
		return `since ${formatClock(live.clock_in_at)}`;
	}
	return `${formatClock(live.clock_in_at)}–${formatClock(live.clock_out_at)}`;
};

const sinceText = (value: string | null | undefined, now: number) => {
	if (!value) {
		return "—";
	}
	const minutes = Math.max(0, dayjs(now).diff(dayjs(value), "minute"));
	if (minutes < 60) {
		return `${minutes}m`;
	}
	const rest = minutes % 60;
	const hours = `${Math.floor(minutes / 60)}h`;
	return rest === 0 ? hours : `${hours} ${rest}m`;
};

const perDayText = (row: WorkerRow) =>
	row.per_day_worked === null
		? "—"
		: oneDecimalFormatter.format(row.per_day_worked);

interface WorkerNameProps {
	name: string;
	role: string;
}

export const WorkerName = ({ name, role }: WorkerNameProps) => (
	<>
		{name}
		{role !== "worker" && (
			<span className="ml-1.5 font-normal text-muted-foreground text-xs">
				{role}
			</span>
		)}
	</>
);

interface AvgBarProps {
	value: number | null;
	max: number;
}

// Scaled to the busiest Avg/day in the same table, so rows compare by eye.
const AvgBar = ({ value, max }: AvgBarProps) => (
	<span className="inline-flex items-center justify-end gap-2">
		<span
			aria-hidden="true"
			className="h-1.5 w-11 overflow-hidden bg-soft-bar-track"
		>
			<span
				className="block h-full bg-soft-bar"
				style={{ width: `${max > 0 && value ? (value / max) * 100 : 0}%` }}
			/>
		</span>
		<span className="w-8 text-right">
			{value === null ? "—" : oneDecimalFormatter.format(value)}
		</span>
	</span>
);

interface Column {
	header: string;
	cell: (row: WorkerRow) => ReactNode;
}

interface WorkerListProps {
	rows: WorkerRow[];
	columns: Column[];
	// The muted second figure on a phone card's first line.
	cardFigure: (row: WorkerRow) => string;
	onOpen: (row: WorkerRow) => void;
}

const WorkerList = ({ rows, columns, cardFigure, onOpen }: WorkerListProps) => (
	<>
		<table className="hidden w-full text-sm tabular-nums lg:table">
			<thead>
				<tr className="bg-muted text-muted-foreground text-xs">
					<th scope="col" className="w-56 px-3 py-2 text-left font-medium">
						Worker
					</th>
					{columns.map((column) => (
						<th
							key={column.header}
							scope="col"
							className="px-3 py-2 text-right font-medium"
						>
							{column.header}
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
						<td className="px-3 py-2">
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
							<td key={column.header} className="px-3 py-2 text-right">
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
		<ul className="grid gap-2 lg:hidden">
			{rows.map((row) => (
				<li key={row.user_id}>
					<button
						type="button"
						onClick={() => onOpen(row)}
						className="grid w-full gap-1.5 border border-border px-3 py-2.5 text-left text-sm tabular-nums active:bg-muted/40"
					>
						<span className="flex items-baseline gap-3">
							<span className="min-w-0 flex-1 font-medium">
								<WorkerName name={row.user_name} role={row.role} />
							</span>
							<span>
								<strong className="font-semibold">
									{n(row.services_processed)}
								</strong>
								<span className="ml-1 text-muted-foreground text-xs">
									Services
								</span>
							</span>
							<span className="min-w-14 text-right text-muted-foreground">
								{cardFigure(row)}
							</span>
							<CaretRightIcon
								aria-hidden="true"
								className="size-3.5 self-center text-muted-foreground"
							/>
						</span>
						<span className="flex flex-wrap items-center gap-1.5">
							<QcChip
								rejects={row.qc_rejects}
								checks={row.qc_checks}
								prefix="QC "
							/>
							<ComplaintsChip
								complaints={row.complaints}
								finished={row.complaint_cohort}
								prefix="Complaints "
							/>
						</span>
					</button>
				</li>
			))}
		</ul>
	</>
);

const qualityColumns: Column[] = [
	{
		header: "QC rejects",
		cell: (row) => <QcChip rejects={row.qc_rejects} checks={row.qc_checks} />,
	},
	{
		header: "Complaints",
		cell: (row) => (
			<ComplaintsChip
				complaints={row.complaints}
				finished={row.complaint_cohort}
			/>
		),
	},
];

interface StoreGroupsProps {
	workers: WorkerRow[];
	isAllStores: boolean;
	columnsFor: (rows: WorkerRow[]) => Column[];
	cardFigure: (row: WorkerRow) => string;
	onOpen: (row: WorkerRow) => void;
}

const StoreGroups = ({
	workers,
	isAllStores,
	columnsFor,
	cardFigure,
	onOpen,
}: StoreGroupsProps) => {
	// Fixed at mount: the live view re-sorts every minute, and a Store the
	// owner closed must not pop open because another overtook it.
	const [firstStoreId] = useState(() => groupByStore(workers)[0]?.store_id);
	if (workers.length === 0) {
		return <p className="text-muted-foreground text-sm">No worker activity</p>;
	}

	if (!isAllStores) {
		return (
			<div className="lg:border lg:border-border">
				<WorkerList
					rows={workers}
					columns={columnsFor(workers)}
					cardFigure={cardFigure}
					onOpen={onOpen}
				/>
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
					chips={
						<>
							<QcChip rejects={totals.qcRejects} checks={totals.qcChecks} />
							<ComplaintsChip
								complaints={totals.complaints}
								finished={totals.complaintCohort}
							/>
						</>
					}
				>
					<WorkerList
						rows={rows}
						columns={columnsFor(rows)}
						cardFigure={cardFigure}
						onOpen={onOpen}
					/>
				</StoreGroup>
			))}
		</div>
	);
};

interface WorkersTableProps {
	workers: WorkerRow[];
	isAllStores: boolean;
	onOpen: (row: WorkerRow) => void;
}

const rangeColumns = (rows: WorkerRow[]): Column[] => {
	const max = Math.max(0, ...rows.map((row) => row.per_day_worked ?? 0));
	return [
		{ header: "Days", cell: (row) => n(row.days_worked) },
		{ header: "Services", cell: (row) => n(row.services_processed) },
		{
			header: "Avg/day",
			cell: (row) => <AvgBar value={row.per_day_worked} max={max} />,
		},
		...qualityColumns,
	];
};

export const RangeWorkersTable = ({
	workers,
	isAllStores,
	onOpen,
}: WorkersTableProps) => (
	<StoreGroups
		workers={workers}
		isAllStores={isAllStores}
		columnsFor={rangeColumns}
		cardFigure={(row) =>
			row.per_day_worked === null ? "—" : `${perDayText(row)}/day`
		}
		onOpen={onOpen}
	/>
);

export const TodayWorkersTable = ({
	workers,
	isAllStores,
	onOpen,
}: WorkersTableProps) => {
	const now = useMinuteClock();
	const columnsFor = (): Column[] => [
		{ header: "Services", cell: (row) => n(row.services_processed) },
		{ header: "On shift", cell: (row) => onShiftText(row.live) },
		{ header: "In hand", cell: (row) => n(row.live?.in_hand ?? 0) },
		{
			header: "Last move",
			cell: (row) => sinceText(row.live?.last_move_at, now),
		},
		...qualityColumns,
	];
	return (
		<StoreGroups
			workers={workers}
			isAllStores={isAllStores}
			columnsFor={columnsFor}
			cardFigure={(row) => `${n(row.live?.in_hand ?? 0)} in hand`}
			onOpen={onOpen}
		/>
	);
};
