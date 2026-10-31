import {
	CancelCircleIcon,
	CheckmarkCircle02Icon,
	TaskDone01Icon,
	ToolsIcon,
} from "@hugeicons/core-free-icons";
import {
	keepPreviousData,
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { LinkProps } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { Section } from "@/components/section";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type FetchQcRejectsQuery,
	QC_REJECTS_PAGE_SIZE,
	type QcRejectItem,
	type QualityReport,
	reportsQueries,
} from "@/features/reports/api";
import { useOpenCheckerSheet } from "@/features/reports/components/checker-sheet";
import { ExportButton } from "@/features/reports/components/export-button";
import { ItemCodeLink } from "@/features/reports/components/item-code-link";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	type NeedsALookItem,
	NeedsALookList,
} from "@/features/reports/components/needs-a-look";
import { QcPerDayChart } from "@/features/reports/components/qc-per-day-chart";
import { BadCount } from "@/features/reports/components/tone-chip";
import { AvgBar, OpenArrow } from "@/features/reports/components/workers-table";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import {
	numberFormatter,
	oneDecimalFormatter,
	percentFormatter,
	pluralCount,
} from "@/features/reports/utils/format";
import { QC_COLORS } from "@/features/reports/utils/palette";
import { longDuration } from "@/features/reports/utils/turnaround";
import { outOf } from "@/features/reports/utils/workers-report";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { staleFade } from "@/lib/content-fade";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface QualityPanelProps {
	from: string;
	to: string;
	storeId?: number;
}

type ServiceRow = QualityReport["by_service"][number];
type CheckerRow = QualityReport["by_checker"][number];
type DamagedLostRow = QualityReport["damaged_lost"][number];
type RangeQuery = Pick<FetchQcRejectsQuery, "from" | "to" | "store_id">;

// An Item on the QC shelf longer than a working day is worth asking about.
const PILE_FLAG_HOURS = 24;
const HOUR_MS = 3_600_000;

// Shown on phone cards only; the desktop table carries the same facts in columns.
const CARD_ONLY = { headerClassName: "hidden", cellClassName: "hidden" };

// Same cap as Services by Worker: the rows scroll inside on desktop, a phone
// shows them all.
const SCROLL_BOX = "flex flex-col lg:max-h-[26rem]";

const OUTCOMES = ["reworked", "refunded", "cancelled", "pending"] as const;

const DAMAGED_LOST_LABELS: Record<DamagedLostRow["reason"], string> = {
	damaged: "Damaged",
	lost: "Lost",
};

const formatWhen = (value: string) =>
	dayjs(value).tz(JAKARTA_TZ).format("D MMM HH:mm");
const formatDay = (value: string) =>
	dayjs(value).tz(JAKARTA_TZ).format("D MMM YYYY");

interface LongTextProps {
	text: string | null;
}

// Long notes wrap on a phone card but stay one line in the desktop table.
const LongText = ({ text }: LongTextProps) => {
	if (!text) {
		return "—";
	}
	return (
		<span title={text} className="block lg:max-w-64 lg:truncate">
			{text}
		</span>
	);
};

interface ItemLineRow {
	order_id: number;
	item_code: string;
	service_name: string | null;
}

const orderCardLink = (row: { order_id: number }): LinkProps => ({
	to: "/orders/$orderId",
	params: { orderId: String(row.order_id) },
});

const itemLineColumns = <
	TRow extends ItemLineRow,
>(): DataTableColumnDef<TRow>[] => [
	{
		id: "item_code",
		header: "Item code",
		meta: {
			width: { percent: 17, minRem: 8 },
			mobileCard: { slot: "title" },
		},
		cell: ({ row }) => (
			<ItemCodeLink orderId={row.original.order_id} className="text-link">
				{row.original.item_code}
			</ItemCodeLink>
		),
	},
	{
		id: "service_name",
		header: "Service",
		meta: {
			width: { percent: 20, minRem: 8 },
			mobileCard: { slot: "subtitle" },
		},
		cell: ({ row }) => row.original.service_name ?? "—",
	},
];

const qcRejectColumns: DataTableColumnDef<QcRejectItem>[] = [
	{
		id: "card_eyebrow",
		header: "When",
		meta: { ...CARD_ONLY, mobileCard: { slot: "eyebrow" } },
		cell: ({ row }) =>
			`${formatWhen(row.original.rejected_at)} · ${row.original.store_code}`,
	},
	{
		id: "rejected_at",
		header: "When",
		meta: {
			width: { percent: 11, minRem: 6.25 },
			cellClassName: "whitespace-nowrap tabular-nums",
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => formatWhen(row.original.rejected_at),
	},
	...itemLineColumns<QcRejectItem>(),
	{
		id: "cleaned_by",
		header: "Cleaned by",
		meta: { width: { percent: 14, minRem: 7 }, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => row.original.cleaned_by_name ?? "—",
	},
	{
		id: "rejected_by",
		header: "Rejected by",
		meta: { width: { percent: 14, minRem: 7 }, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => row.original.rejected_by_name,
	},
	{
		id: "reason",
		header: "Reason",
		meta: {
			width: { percent: 24, minRem: 8 },
			mobileCard: { slot: "subtitle" },
		},
		cell: ({ row }) => row.original.reason || "—",
	},
	{
		id: "card_people",
		header: "People",
		meta: {
			...CARD_ONLY,
			mobileCard: { slot: "subtitle", className: "text-muted-foreground" },
		},
		cell: ({ row }) =>
			`Cleaned ${row.original.cleaned_by_name ?? "—"} · Rejected ${row.original.rejected_by_name}`,
	},
];

const serviceColumns: DataTableColumnDef<ServiceRow>[] = [
	{
		accessorKey: "service_name",
		header: "Service",
		meta: { width: { percent: 40, minRem: 9 }, mobileCard: { slot: "title" } },
	},
	{
		id: "processed",
		header: "Processed",
		meta: {
			align: "right",
			width: { percent: 15, minRem: 5.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => numberFormatter.format(row.original.processed),
	},
	{
		id: "first_pass",
		header: "First-pass",
		meta: {
			align: "right",
			width: { percent: 15, minRem: 5.5 },
			mobileCard: { slot: "title-end", className: "tabular-nums" },
		},
		cell: ({ row }) => percentFormatter.format(row.original.first_pass_rate),
	},
	{
		id: "qc_rejects",
		header: "QC rejects",
		meta: {
			align: "right",
			width: { percent: 15, minRem: 5.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => (
			<BadCount bad={row.original.sent_back} total={row.original.processed} />
		),
	},
	{
		id: "complaints",
		header: "Complaints",
		meta: {
			align: "right",
			width: { percent: 15, minRem: 5.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => (
			<BadCount bad={row.original.complaints} total={row.original.processed} />
		),
	},
	{
		id: "card_summary",
		header: "Summary",
		meta: {
			...CARD_ONLY,
			mobileCard: { slot: "subtitle", className: "text-muted-foreground" },
		},
		cell: ({ row }) =>
			`${numberFormatter.format(row.original.processed)} done · ${pluralCount(row.original.sent_back, "QC reject")} · ${pluralCount(row.original.complaints, "complaint")}`,
	},
];

const checkerColumnsFor = (
	rows: CheckerRow[],
): DataTableColumnDef<CheckerRow>[] => {
	const maxPerDay = Math.max(0, ...rows.map((row) => row.per_day));
	return [
		{
			accessorKey: "user_name",
			header: "Checked by",
			meta: { kind: "name", width: { percent: 24, minRem: 8 } },
		},
		{
			id: "checks",
			header: "Checks",
			meta: { align: "right", width: { percent: 10, minRem: 4 } },
			cell: ({ row }) => numberFormatter.format(row.original.checks),
		},
		{
			id: "days",
			header: "Days",
			meta: { align: "right", width: { percent: 8, minRem: 3 } },
			cell: ({ row }) => numberFormatter.format(row.original.days_checked),
		},
		{
			id: "per_day",
			header: "Avg/day",
			meta: { align: "right", width: { percent: 14, minRem: 5.5 } },
			cell: ({ row }) => (
				<AvgBar value={row.original.per_day} max={maxPerDay} />
			),
		},
		{
			id: "qc_rejects",
			header: "QC rejects",
			meta: { align: "right", width: { percent: 13, minRem: 4.5 } },
			cell: ({ row }) => (
				<BadCount bad={row.original.rejects} total={row.original.checks} />
			),
		},
		{
			id: "self_checks",
			header: "Self-checks",
			meta: { align: "right", width: { percent: 13, minRem: 5 } },
			cell: ({ row }) => (
				<BadCount bad={row.original.self_checks} total={row.original.passes} />
			),
		},
		{
			id: "complaints_after",
			header: "Complaints",
			meta: { align: "right", width: { percent: 13, minRem: 4.5 } },
			cell: ({ row }) => (
				<BadCount
					bad={row.original.complaints_after}
					total={row.original.passes}
				/>
			),
		},
		{
			id: "open",
			header: () => <span className="sr-only">Open</span>,
			meta: { width: { percent: 5, minRem: 1.75 } },
			cell: () => <OpenArrow />,
		},
	];
};

interface CheckerCardProps {
	row: CheckerRow;
	onOpen: (row: CheckerRow) => void;
}

// Same shape as a Workers phone card: the count up top, only bad numbers in red.
const CheckerCard = ({ row, onOpen }: CheckerCardProps) => (
	<button
		type="button"
		onClick={() => onOpen(row)}
		className="grid w-full gap-1 px-4 py-3 text-left text-body tabular-nums active:bg-muted/40"
	>
		<span className="flex items-baseline gap-2">
			<span className="min-w-0 flex-1 font-medium">{row.user_name}</span>
			<span>
				<span className="font-medium">
					{numberFormatter.format(row.checks)}
				</span>
				<span className="ml-1 text-muted-foreground">
					{row.checks === 1 ? "check" : "checks"}
				</span>
			</span>
			<span className="self-center">
				<OpenArrow />
			</span>
		</span>
		<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subhead text-muted-foreground">
			{`${oneDecimalFormatter.format(row.per_day)}/day · ${pluralCount(row.days_checked, "day")}`}
			{row.rejects > 0 && (
				<BadCount bad={row.rejects} total={row.checks} prefix="QC " />
			)}
			{row.self_checks > 0 && (
				<BadCount bad={row.self_checks} total={row.passes} prefix="Self " />
			)}
			{row.complaints_after > 0 && (
				<BadCount
					bad={row.complaints_after}
					total={row.passes}
					prefix="Complaints "
				/>
			)}
		</span>
	</button>
);

const damagedLostColumns: DataTableColumnDef<DamagedLostRow>[] = [
	{
		id: "card_eyebrow",
		header: "Date",
		meta: { ...CARD_ONLY, mobileCard: { slot: "eyebrow" } },
		cell: ({ row }) =>
			`${formatDay(row.original.refunded_at)} · ${row.original.store_code}`,
	},
	{
		id: "refunded_at",
		header: "Date",
		meta: {
			width: { percent: 11, minRem: 6.25 },
			cellClassName: "whitespace-nowrap tabular-nums",
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => formatDay(row.original.refunded_at),
	},
	...itemLineColumns<DamagedLostRow>(),
	{
		id: "reason",
		header: "Reason",
		meta: { width: { percent: 11, minRem: 6 }, mobileCard: { slot: "badges" } },
		cell: ({ row }) => (
			<Badge variant={row.original.reason === "lost" ? "danger" : "warning"}>
				{DAMAGED_LOST_LABELS[row.original.reason]}
			</Badge>
		),
	},
	{
		id: "amount",
		header: "Amount",
		meta: {
			align: "right",
			width: { percent: 11, minRem: 6 },
			mobileCard: { slot: "footer" },
		},
		cell: ({ row }) => formatMoney(row.original.amount),
	},
	{
		id: "note",
		header: "Note",
		meta: { width: { percent: 30, minRem: 8 } },
		cell: ({ row }) => <LongText text={row.original.note} />,
	},
];

interface QcRejectsSectionProps {
	range: RangeQuery;
}

const QcRejectsSection = ({ range }: QcRejectsSectionProps) => {
	const [offset, setOffset] = useState(0);
	const query = useQuery({
		...reportsQueries.qcRejects({
			...range,
			limit: QC_REJECTS_PAGE_SIZE,
			offset,
		}),
		placeholderData: keepPreviousData,
	});
	const total = query.data?.meta.total ?? 0;

	return (
		<Section
			id="quality-qc-rejects"
			title="QC Rejects"
			count={query.data ? numberFormatter.format(total) : null}
		>
			<div className={SCROLL_BOX}>
				<DataTable
					emptyIcon={CancelCircleIcon}
					columns={qcRejectColumns}
					data={query.data?.items ?? []}
					isLoading={query.isPending}
					isStale={query.isPlaceholderData}
					filterKey={JSON.stringify({ range, offset })}
					skeletonLines="wrapped"
					emptyMessage="No QC rejects in range."
					getRowLink={orderCardLink}
				/>
			</div>
			{/* A year of rejects outgrows one load; a fortnight never does. */}
			{total > QC_REJECTS_PAGE_SIZE && (
				<TablePagination
					meta={query.data?.meta}
					isLoading={query.isFetching}
					onPageChange={(page) => setOffset((page - 1) * QC_REJECTS_PAGE_SIZE)}
				/>
			)}
		</Section>
	);
};

interface QcPerDaySectionProps {
	daily: QualityReport["daily"];
}

const QcPerDaySection = ({ daily }: QcPerDaySectionProps) => {
	const sum = (key: "arrived" | "passes" | "qc_rejects") =>
		daily.rows.reduce((total, row) => total + row[key], 0);
	const arrived = sum("arrived");
	const passes = sum("passes");
	const qcRejects = sum("qc_rejects");
	const pile = arrived - passes - qcRejects;
	// Read like a Workers Store header: plain words, the figures in medium.
	return (
		<Section id="quality-per-day" title="QC per Day">
			<div className="grid gap-3 rounded-lg border bg-card p-4">
				<p className="text-body tabular-nums">
					<span className="font-medium">{numberFormatter.format(arrived)}</span>
					{" arrived · "}
					<span className="font-medium">
						{numberFormatter.format(passes + qcRejects)}
					</span>
					{" checked · pile "}
					<span
						className={cn(
							"font-medium",
							pile > 0 && "text-tone-warn-foreground",
						)}
					>
						{pile > 0
							? `+${numberFormatter.format(pile)}`
							: numberFormatter.format(pile)}
					</span>
				</p>
				<QcPerDayChart rows={daily.rows} bucket={daily.bucket} />
			</div>
		</Section>
	);
};

const hoursSince = (at: string, now: number) =>
	(now - new Date(at).getTime()) / HOUR_MS;

const qualityFlags = (data: QualityReport, now: number): NeedsALookItem[] => {
	const flags: NeedsALookItem[] = [];
	const { count, oldest_at: oldestAt } = data.waiting_qc_now;
	const waitedHours = oldestAt === null ? 0 : hoursSince(oldestAt, now);
	if (count > 0 && waitedHours > PILE_FLAG_HOURS) {
		const behind = data.daily.rows.filter(
			(row) => row.arrived > row.passes + row.qc_rejects,
		).length;
		const unit = data.daily.bucket === "day" ? "day" : "week";
		flags.push({
			key: "pile",
			name: "Waiting QC",
			before: `${pluralCount(count, "Item")} on the shelf, `,
			problem: `oldest ${longDuration(waitedHours)}`,
			after: ` · checks fell behind on ${behind}/${pluralCount(data.daily.rows.length, unit)}`,
		});
	}
	// One line for everyone, so a Store full of self-checks doesn't bury the
	// pile; the Checkers table says who.
	const selfCheckers = data.by_checker.filter((row) => row.self_checks > 0);
	if (selfCheckers.length > 0) {
		flags.push({
			key: "self-check",
			name: "Self-checks",
			before: `${pluralCount(selfCheckers.length, "checker")} `,
			problem: `passed ${pluralCount(
				selfCheckers.reduce((sum, row) => sum + row.self_checks, 0),
				"Item",
			)} they cleaned`,
			after: " · see Self-checks below",
		});
	}
	return flags;
};

interface QualityNeedsALookProps {
	data: QualityReport;
}

const QualityNeedsALook = ({ data }: QualityNeedsALookProps) => {
	const now = useMinuteClock();
	return (
		<NeedsALookList id="quality-needs-a-look" items={qualityFlags(data, now)} />
	);
};

interface WaitingSinceProps {
	oldestAt: string | null;
}

// Its own clock, so the minute tick redraws one line instead of the whole tab.
const WaitingSince = ({ oldestAt }: WaitingSinceProps) => {
	const now = useMinuteClock();
	return oldestAt === null
		? "none waiting"
		: `oldest ${longDuration(hoursSince(oldestAt, now))}`;
};

interface MistakeRowProps {
	label: string;
	count: number;
	color: string;
	detail: string;
}

const MistakeRow = ({ label, count, color, detail }: MistakeRowProps) => (
	<li className="flex items-start justify-between gap-3">
		<span className="grid gap-0.5">
			<span className="flex items-center gap-2 text-body">
				<span
					aria-hidden="true"
					className="size-2 rounded-full"
					style={{ backgroundColor: color }}
				/>
				{label}
			</span>
			<span className="pl-4 text-muted-foreground text-subhead">{detail}</span>
		</span>
		<span className="font-medium text-body tabular-nums">
			{numberFormatter.format(count)}
		</span>
	</li>
);

interface MistakesSectionProps {
	data: QualityReport;
}

// Every mistake was either sent back at QC or found by the Customer; an Item
// with both counts once, as a Complaint.
const MistakesSection = ({ data }: MistakesSectionProps) => {
	const { mistakes, complaint_outcomes: outcomes } = data;
	const outcomeLine = OUTCOMES.filter((key) => outcomes[key] > 0)
		.map((key) => `${key} ${numberFormatter.format(outcomes[key])}`)
		.join(" · ");
	return (
		<Section id="quality-mistakes" title="Mistakes">
			<div className="grid gap-3.5 rounded-lg border bg-card p-4">
				<div>
					<p className="font-medium text-title-1 tabular-nums">
						{pluralCount(mistakes.total, "mistake")}
					</p>
					<p className="text-subhead tabular-nums">
						{`out of ${pluralCount(data.summary.current.services_processed, "Service")}`}
					</p>
				</div>
				<div className="flex h-1.5 gap-0.5">
					{mistakes.total === 0 ? (
						<span className="flex-1 rounded-full bg-soft-bar-track" />
					) : (
						<>
							<span
								className="rounded-full"
								style={{
									flexGrow: mistakes.qc_rejects,
									backgroundColor: QC_COLORS.qcRejects,
								}}
							/>
							<span
								className="rounded-full"
								style={{
									flexGrow: mistakes.complaints,
									backgroundColor: QC_COLORS.complaints,
								}}
							/>
						</>
					)}
				</div>
				<ul className="grid gap-2.5">
					<MistakeRow
						label="QC rejects"
						count={mistakes.qc_rejects}
						color={QC_COLORS.qcRejects}
						detail="Fixed before the Customer saw it"
					/>
					<MistakeRow
						label="Complaints"
						count={mistakes.complaints}
						color={QC_COLORS.complaints}
						detail={
							outcomeLine
								? outcomeLine.charAt(0).toUpperCase() + outcomeLine.slice(1)
								: "None"
						}
					/>
				</ul>
			</div>
		</Section>
	);
};

const fetchAllQcRejects = async (
	queryClient: QueryClient,
	range: RangeQuery,
) => {
	const fetchPage = (offset: number) =>
		queryClient.fetchQuery(
			reportsQueries.qcRejects({
				...range,
				limit: QC_REJECTS_PAGE_SIZE,
				offset,
			}),
		);
	const first = await fetchPage(0);
	const items = [...first.items];
	for (
		let offset = QC_REJECTS_PAGE_SIZE;
		offset < first.meta.total;
		offset += QC_REJECTS_PAGE_SIZE
	) {
		const page = await fetchPage(offset);
		items.push(...page.items);
	}
	return items;
};

type QualitySummary = QualityReport["summary"]["current"];

const SUMMARY_ROWS: [keyof QualitySummary, string][] = [
	["services_processed", "Services processed"],
	["first_pass", "First-pass"],
	["sent_back", "QC rejected"],
	["first_pass_rate", "First-pass rate"],
	["complaints", "Complaints"],
	["complaint_rate", "Complaint rate"],
	["qc_rejects", "QC rejects"],
	["passes", "QC passes"],
	["self_checks", "Self-checks"],
	["self_check_rate", "Self-check rate"],
];

const buildQualityCsv = (data: QualityReport, rejects: QcRejectItem[]) => {
	const { current, previous } = data.summary;
	const lines = ["Summary,Metric,Current,Previous"];
	for (const [key, label] of SUMMARY_ROWS) {
		lines.push(`Summary,${label},${current[key]},${previous[key]}`);
	}
	lines.push(
		"",
		"Mistakes,QC rejects,Complaints,Total",
		`Mistakes,${data.mistakes.qc_rejects},${data.mistakes.complaints},${data.mistakes.total}`,
	);
	lines.push("", "Complaint outcomes,Outcome,Complaints");
	for (const key of OUTCOMES) {
		lines.push(`Complaint outcomes,${key},${data.complaint_outcomes[key]}`);
	}
	lines.push("", "QC per day,Day,Arrived,Passed,QC rejects");
	for (const row of data.daily.rows) {
		lines.push(
			`QC per day,${row.label},${row.arrived},${row.passes},${row.qc_rejects}`,
		);
	}
	lines.push(
		"",
		"By Service,Service,Processed,First-pass,First-pass rate,QC rejects,Complaints",
	);
	for (const s of data.by_service) {
		lines.push(
			`By Service,${escapeCsv(s.service_name)},${s.processed},${s.first_pass},${s.first_pass_rate},${s.sent_back},${s.complaints}`,
		);
	}
	lines.push(
		"",
		"Checkers,Checked by,Checks,Days checked,Per day,QC rejects,Reject rate,Self-checks,Self-check rate,Complaints after",
	);
	for (const c of data.by_checker) {
		lines.push(
			`Checkers,${escapeCsv(c.user_name)},${c.checks},${c.days_checked},${c.per_day},${c.rejects},${c.reject_rate},${c.self_checks},${c.self_check_rate},${c.complaints_after}`,
		);
	}
	lines.push(
		"",
		"Damaged & lost,Date,Order,Item code,Service,Store,Reason,Amount,Note",
	);
	for (const d of data.damaged_lost) {
		lines.push(
			`Damaged & lost,${escapeCsv(formatDay(d.refunded_at))},${escapeCsv(d.order_code)},${escapeCsv(d.item_code)},${escapeCsv(d.service_name)},${escapeCsv(d.store_code)},${d.reason},${d.amount},${escapeCsv(d.note)}`,
		);
	}
	lines.push(
		"",
		"QC rejects,When,Order,Item code,Service,Store,Cleaned by,Rejected by,Reason",
	);
	for (const r of rejects) {
		lines.push(
			`QC rejects,${escapeCsv(formatWhen(r.rejected_at))},${escapeCsv(r.order_code)},${escapeCsv(r.item_code)},${escapeCsv(r.service_name)},${escapeCsv(r.store_code)},${escapeCsv(r.cleaned_by_name)},${escapeCsv(r.rejected_by_name)},${escapeCsv(r.reason)}`,
		);
	}
	return lines.join("\n");
};

export const QualityPanel = ({ from, to, storeId }: QualityPanelProps) => {
	const range = { from, to, store_id: storeId };
	const queryClient = useQueryClient();
	const openCheckerSheet = useOpenCheckerSheet();
	const query = useQuery({
		...reportsQueries.quality(range),
		placeholderData: keepPreviousData,
	});
	const data = query.data;
	const exportMutation = useMutation({
		mutationFn: async (report: QualityReport) => ({
			report,
			rejects: await fetchAllQcRejects(queryClient, range),
		}),
		onSuccess: ({ report, rejects }) =>
			downloadCsv(
				csvFilename("quality", report.from, report.to, report.store_id),
				buildQualityCsv(report, rejects),
			),
	});

	const current = data?.summary.current;
	const deltas = data?.summary.deltas;
	const checks = current ? current.passes + current.qc_rejects : 0;
	const checkerColumns = useMemo(
		() => checkerColumnsFor(data?.by_checker ?? []),
		[data?.by_checker],
	);
	const handleOpenChecker = (row: CheckerRow) =>
		data &&
		openCheckerSheet({
			from: data.from,
			to: data.to,
			storeId,
			bucket: data.daily.bucket,
			row,
		});

	return (
		<div className={cn("grid gap-6", staleFade(query.isPlaceholderData))}>
			<ExportButton
				disabled={!data || exportMutation.isPending}
				onClick={() => data && exportMutation.mutate(data)}
			/>
			<KpiRow isPending={!data}>
				<KpiCard
					label="First-pass rate"
					value={percentFormatter.format(current?.first_pass_rate ?? 0)}
					delta={deltas?.first_pass_rate ?? null}
					deltaAs="points"
					helper={
						current
							? `${outOf(current.first_pass, current.services_processed)} Services`
							: null
					}
				/>
				<KpiCard
					label="QC rejects"
					value={numberFormatter.format(current?.qc_rejects ?? 0)}
					delta={deltas?.qc_rejects ?? null}
					isLowerBetter
					helper={
						current
							? `${outOf(current.qc_rejects, checks)} ${checks === 1 ? "check" : "checks"}`
							: null
					}
				/>
				<KpiCard
					label="Complaint rate"
					value={percentFormatter.format(current?.complaint_rate ?? 0)}
					delta={deltas?.complaint_rate ?? null}
					deltaAs="points"
					helper={
						current
							? `${outOf(current.complaints, current.services_processed)} so far`
							: null
					}
					isLowerBetter
				/>
				<KpiCard
					label="Waiting QC now"
					value={numberFormatter.format(data?.waiting_qc_now.count ?? 0)}
					helper={
						data ? (
							<WaitingSince oldestAt={data.waiting_qc_now.oldest_at} />
						) : null
					}
				/>
			</KpiRow>

			{data ? (
				<>
					<QcPerDaySection daily={data.daily} />

					<QualityNeedsALook data={data} />

					<Section
						id="quality-checkers"
						title="Checkers"
						count={numberFormatter.format(data.by_checker.length)}
					>
						<DataTable
							emptyIcon={TaskDone01Icon}
							columns={checkerColumns}
							data={data.by_checker}
							emptyMessage="No quality checks in range."
							onRowOpen={handleOpenChecker}
							renderCard={(row) => (
								<CheckerCard row={row} onOpen={handleOpenChecker} />
							)}
						/>
					</Section>

					<MistakesSection data={data} />

					<Section id="quality-by-service" title="By Service">
						<div className={SCROLL_BOX}>
							<DataTable
								emptyIcon={ToolsIcon}
								columns={serviceColumns}
								data={data.by_service}
								emptyMessage="No Services processed in range."
							/>
						</div>
					</Section>
				</>
			) : (
				<Skeleton className="h-80 rounded-lg" />
			)}

			{/* A new range or Store starts the list again at its first page. */}
			<QcRejectsSection key={`${from}|${to}|${storeId}`} range={range} />

			{data ? (
				<Section id="quality-damaged-lost" title="Damaged & Lost">
					<DataTable
						emptyIcon={CheckmarkCircle02Icon}
						columns={damagedLostColumns}
						data={data.damaged_lost}
						emptyMessage="None in range."
						getRowLink={orderCardLink}
					/>
				</Section>
			) : null}
		</div>
	);
};
