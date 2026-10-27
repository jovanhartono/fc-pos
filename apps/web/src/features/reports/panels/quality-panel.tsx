import {
	keepPreviousData,
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { LinkProps } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { Section } from "@/components/section";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type FetchQcRejectsQuery,
	QC_REJECTS_PREVIEW_SIZE as PREVIEW_SIZE,
	type QcRejectItem,
	type QualityReport,
	reportsQueries,
} from "@/features/reports/api";
import { ExportButton } from "@/features/reports/components/export-button";
import { ItemCodeLink } from "@/features/reports/components/item-code-link";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
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
import { staleFade } from "@/lib/content-fade";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

interface QualityPanelProps {
	from: string;
	to: string;
	storeId?: number;
}

type QualitySummary = QualityReport["summary"]["current"];
type ComplaintOutcomes = QualityReport["complaint_outcomes"];
type ServiceRow = QualityReport["by_service"][number];
type CheckerRow = QualityReport["by_checker"][number];
type DamagedLostRow = QualityReport["damaged_lost"][number];
type RangeQuery = Pick<FetchQcRejectsQuery, "from" | "to" | "store_id">;

const PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 200;

// Shown on phone cards only; the desktop table carries the same facts in columns.
const CARD_ONLY = { headerClassName: "hidden", cellClassName: "hidden" };

const OUTCOMES = ["reworked", "refunded", "cancelled", "pending"] as const;

const DAMAGED_LOST_LABELS: Record<DamagedLostRow["reason"], string> = {
	damaged: "Damaged",
	lost: "Lost",
};

const formatWhen = (value: string) =>
	dayjs(value).tz(JAKARTA_TZ).format("D MMM HH:mm");
const formatDay = (value: string) =>
	dayjs(value).tz(JAKARTA_TZ).format("D MMM YYYY");
const shareOf = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

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
			<ItemCodeLink orderId={row.original.order_id}>
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
		id: "sent_back",
		header: "Sent back",
		meta: {
			align: "right",
			width: { percent: 15, minRem: 5.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => numberFormatter.format(row.original.sent_back),
	},
	{
		id: "complaints",
		header: "Complaints",
		meta: {
			align: "right",
			width: { percent: 15, minRem: 5.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => numberFormatter.format(row.original.complaints),
	},
	{
		id: "card_summary",
		header: "Summary",
		meta: {
			...CARD_ONLY,
			mobileCard: { slot: "subtitle", className: "text-muted-foreground" },
		},
		cell: ({ row }) =>
			`${numberFormatter.format(row.original.processed)} done · ${numberFormatter.format(row.original.sent_back)} sent back · ${pluralCount(row.original.complaints, "complaint")}`,
	},
];

const checkerColumns: DataTableColumnDef<CheckerRow>[] = [
	{
		accessorKey: "user_name",
		header: "Checked by",
		meta: { width: { percent: 22, minRem: 9 }, mobileCard: { slot: "title" } },
	},
	{
		id: "card_checks",
		header: "Checks",
		meta: {
			...CARD_ONLY,
			mobileCard: { slot: "title-end", className: "tabular-nums" },
		},
		cell: ({ row }) => pluralCount(row.original.checks, "check"),
	},
	{
		id: "checks",
		header: "Checks",
		meta: {
			align: "right",
			width: { percent: 11, minRem: 4.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => numberFormatter.format(row.original.checks),
	},
	{
		id: "per_day",
		header: "Per day",
		meta: {
			align: "right",
			width: { percent: 11, minRem: 4.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => oneDecimalFormatter.format(row.original.per_day),
	},
	{
		id: "rejects",
		header: "Rejected",
		meta: {
			align: "right",
			width: { percent: 11, minRem: 5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => numberFormatter.format(row.original.rejects),
	},
	{
		id: "reject_rate",
		header: "Reject rate",
		meta: {
			align: "right",
			width: { percent: 12, minRem: 5.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => percentFormatter.format(row.original.reject_rate),
	},
	{
		id: "self_check_rate",
		header: "Self-checked",
		meta: {
			align: "right",
			width: { percent: 14, minRem: 6.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => percentFormatter.format(row.original.self_check_rate),
	},
	{
		id: "complaints_after",
		header: "Complaints after",
		meta: {
			align: "right",
			width: { percent: 19, minRem: 7.75 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => numberFormatter.format(row.original.complaints_after),
	},
	{
		id: "card_summary",
		header: "Summary",
		meta: {
			...CARD_ONLY,
			mobileCard: { slot: "subtitle", className: "text-muted-foreground" },
		},
		cell: ({ row }) =>
			`${oneDecimalFormatter.format(row.original.per_day)} per day · ${numberFormatter.format(row.original.rejects)} rejected · ${percentFormatter.format(row.original.self_check_rate)} self-checked · ${numberFormatter.format(row.original.complaints_after)} complaints after`,
	},
];

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
	const [isShowingAll, setIsShowingAll] = useState(false);
	const [offset, setOffset] = useState(0);
	const query = useQuery({
		...reportsQueries.qcRejects({
			...range,
			limit: isShowingAll ? PAGE_SIZE : PREVIEW_SIZE,
			offset,
		}),
		placeholderData: keepPreviousData,
	});
	const total = query.data?.meta.total ?? 0;
	// "Show all" grows the list from 10 to 50 at the tap, drawn as placeholder
	// rows, so the pager isn't shoved off screen seconds later.
	const expectedRows = isShowingAll
		? Math.min(Math.max(total - offset, 0), PAGE_SIZE)
		: PREVIEW_SIZE;
	const isGrowing =
		query.isPlaceholderData && (query.data?.items.length ?? 0) < expectedRows;

	return (
		<Section
			id="quality-qc-rejects"
			title="QC rejects"
			count={query.data ? numberFormatter.format(total) : null}
			aside={
				!isShowingAll &&
				total > PREVIEW_SIZE && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsShowingAll(true)}
					>
						{`Show all ${numberFormatter.format(total)}`}
					</Button>
				)
			}
		>
			<div className="lg:overflow-hidden lg:rounded-lg lg:bg-card">
				<DataTable
					columns={qcRejectColumns}
					data={query.data?.items ?? []}
					isLoading={query.isPending || isGrowing}
					isStale={query.isPlaceholderData}
					filterKey={JSON.stringify({ range, isShowingAll, offset })}
					skeletonRowCount={expectedRows}
					skeletonLines="wrapped"
					emptyMessage="No QC rejects in range."
					getRowLink={orderCardLink}
				/>
			</div>
			{isShowingAll ? (
				<TablePagination
					meta={query.data?.meta}
					isLoading={query.isFetching}
					onPageChange={(page) => setOffset((page - 1) * PAGE_SIZE)}
				/>
			) : null}
		</Section>
	);
};

interface CaughtBarProps {
	label: string;
	count: number;
	processed: number;
	children?: ReactNode;
}

const CaughtBar = ({ label, count, processed, children }: CaughtBarProps) => {
	const share = shareOf(count, processed);
	return (
		<li className="grid gap-1">
			<div className="flex items-center justify-between gap-2">
				<span className="truncate text-body font-medium">{label}</span>
				<span className="flex items-center gap-3 text-body tabular-nums">
					<span>{numberFormatter.format(count)}</span>
					<span className="w-14 text-right text-muted-foreground">
						{percentFormatter.format(share)}
					</span>
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-bar-track">
				<div
					className="h-full rounded-full bg-primary"
					style={{ width: `${share * 100}%` }}
				/>
			</div>
			{children}
		</li>
	);
};

interface CaughtSectionProps {
	summary: QualitySummary;
	outcomes: ComplaintOutcomes;
}

const CaughtSection = ({ summary, outcomes }: CaughtSectionProps) => {
	const processed = summary.services_processed;
	const outcomeLine = OUTCOMES.filter((key) => outcomes[key] > 0)
		.map((key) => `${key} ${numberFormatter.format(outcomes[key])}`)
		.join(" · ");

	return (
		<Section id="quality-caught" title="Where mistakes were caught">
			<ul className="grid gap-3 rounded-lg border bg-card p-4">
				<CaughtBar
					label="Services processed"
					count={processed}
					processed={processed}
				/>
				<CaughtBar
					label="Never sent back"
					count={summary.first_pass}
					processed={processed}
				/>
				<CaughtBar
					label="Sent back at QC"
					count={summary.sent_back}
					processed={processed}
				/>
				<CaughtBar
					label="Reached the Customer"
					count={summary.complaints}
					processed={processed}
				>
					{outcomeLine && (
						<p className="text-subhead tabular-nums">{outcomeLine}</p>
					)}
				</CaughtBar>
			</ul>
		</Section>
	);
};

const fetchAllQcRejects = async (
	queryClient: QueryClient,
	range: RangeQuery,
) => {
	const fetchPage = (offset: number) =>
		queryClient.fetchQuery(
			reportsQueries.qcRejects({ ...range, limit: EXPORT_PAGE_SIZE, offset }),
		);
	const first = await fetchPage(0);
	const items = [...first.items];
	for (
		let offset = EXPORT_PAGE_SIZE;
		offset < first.meta.total;
		offset += EXPORT_PAGE_SIZE
	) {
		const page = await fetchPage(offset);
		items.push(...page.items);
	}
	return items;
};

const SUMMARY_ROWS: [keyof QualitySummary, string][] = [
	["services_processed", "Services processed"],
	["first_pass", "Never sent back"],
	["sent_back", "Sent back at QC"],
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
	lines.push("", "Complaint outcomes,Outcome,Complaints");
	for (const key of OUTCOMES) {
		lines.push(`Complaint outcomes,${key},${data.complaint_outcomes[key]}`);
	}
	lines.push(
		"",
		"By Service,Service,Processed,First-pass,First-pass rate,Sent back,Complaints",
	);
	for (const s of data.by_service) {
		lines.push(
			`By Service,${escapeCsv(s.service_name)},${s.processed},${s.first_pass},${s.first_pass_rate},${s.sent_back},${s.complaints}`,
		);
	}
	lines.push(
		"",
		"Quality checks,Checked by,Checks,Days checked,Per day,Rejected,Reject rate,Self-checks,Self-check rate,Complaints after",
	);
	for (const c of data.by_checker) {
		lines.push(
			`Quality checks,${escapeCsv(c.user_name)},${c.checks},${c.days_checked},${c.per_day},${c.rejects},${c.reject_rate},${c.self_checks},${c.self_check_rate},${c.complaints_after}`,
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

interface QualitySectionsProps {
	range: RangeQuery;
}

const QualitySections = ({ range }: QualitySectionsProps) => {
	const queryClient = useQueryClient();
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
				/>
				<KpiCard
					label="QC rejects"
					value={numberFormatter.format(current?.qc_rejects ?? 0)}
					delta={deltas?.qc_rejects ?? null}
					isLowerBetter
				/>
				<KpiCard
					label="Complaint rate"
					value={percentFormatter.format(current?.complaint_rate ?? 0)}
					delta={deltas?.complaint_rate ?? null}
					deltaAs="points"
					helper="so far"
					isLowerBetter
				/>
				<KpiCard
					label="Self-checked"
					value={percentFormatter.format(current?.self_check_rate ?? 0)}
					delta={deltas?.self_check_rate ?? null}
					deltaAs="points"
					helper="of passes"
					isLowerBetter
				/>
			</KpiRow>

			{data ? (
				<>
					<CaughtSection
						summary={data.summary.current}
						outcomes={data.complaint_outcomes}
					/>

					<Section id="quality-by-service" title="By Service">
						<div className="lg:overflow-hidden lg:rounded-lg lg:bg-card">
							<DataTable
								columns={serviceColumns}
								data={data.by_service}
								emptyMessage="No Services processed in range."
							/>
						</div>
					</Section>

					<Section id="quality-by-checker" title="Quality checks by person">
						<div className="lg:overflow-hidden lg:rounded-lg lg:bg-card">
							<DataTable
								columns={checkerColumns}
								data={data.by_checker}
								emptyMessage="No quality checks in range."
							/>
						</div>
					</Section>

					<Section id="quality-damaged-lost" title="Damaged & lost">
						<div className="lg:overflow-hidden lg:rounded-lg lg:bg-card">
							<DataTable
								columns={damagedLostColumns}
								data={data.damaged_lost}
								emptyMessage="None in range."
								getRowLink={orderCardLink}
							/>
						</div>
					</Section>
				</>
			) : (
				<Skeleton className="h-80 rounded-lg" />
			)}
		</div>
	);
};

export const QualityPanel = ({ from, to, storeId }: QualityPanelProps) => {
	const range = { from, to, store_id: storeId };
	return (
		<div className="grid gap-6">
			{/* A new range or Store starts the list again at its latest 10. */}
			<QcRejectsSection key={`${from}|${to}|${storeId}`} range={range} />
			<QualitySections range={range} />
		</div>
	);
};
