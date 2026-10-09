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
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
	percentFormatter,
} from "@/features/reports/utils/format";
import dayjs, { JAKARTA_TZ } from "@/lib/dayjs";
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

const HEADING_CLASS =
	"flex items-center gap-2 text-sm font-semibold text-foreground";
// Shown on phone cards only; the desktop table carries the same facts in columns.
const CARD_ONLY = { headerClassName: "hidden", cellClassName: "hidden" };
const NUMERIC = {
	headerClassName: "text-right",
	cellClassName: "text-right tabular-nums",
};

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
const plural = (count: number, word: string) =>
	`${numberFormatter.format(count)} ${word}${count === 1 ? "" : "s"}`;

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
		meta: { mobileCard: { slot: "title" } },
		cell: ({ row }) => (
			<ItemCodeLink orderId={row.original.order_id}>
				{row.original.item_code}
			</ItemCodeLink>
		),
	},
	{
		id: "service_name",
		header: "Service",
		meta: { mobileCard: { slot: "subtitle" } },
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
			cellClassName: "whitespace-nowrap tabular-nums",
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => formatWhen(row.original.rejected_at),
	},
	...itemLineColumns<QcRejectItem>(),
	{
		id: "cleaned_by",
		header: "Cleaned by",
		meta: { mobileCard: { slot: "hidden" } },
		cell: ({ row }) => row.original.cleaned_by_name ?? "—",
	},
	{
		id: "rejected_by",
		header: "Rejected by",
		meta: { mobileCard: { slot: "hidden" } },
		cell: ({ row }) => row.original.rejected_by_name,
	},
	{
		id: "reason",
		header: "Reason",
		meta: { mobileCard: { slot: "subtitle" } },
		cell: ({ row }) => <LongText text={row.original.reason} />,
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
		meta: { mobileCard: { slot: "title" } },
	},
	{
		id: "processed",
		header: "Processed",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => numberFormatter.format(row.original.processed),
	},
	{
		id: "first_pass",
		header: "First-pass",
		meta: {
			...NUMERIC,
			mobileCard: { slot: "title-end", className: "tabular-nums" },
		},
		cell: ({ row }) => percentFormatter.format(row.original.first_pass_rate),
	},
	{
		id: "sent_back",
		header: "Sent back",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => numberFormatter.format(row.original.sent_back),
	},
	{
		id: "complaints",
		header: "Complaints",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
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
			`${numberFormatter.format(row.original.processed)} done · ${numberFormatter.format(row.original.sent_back)} sent back · ${plural(row.original.complaints, "complaint")}`,
	},
];

const checkerColumns: DataTableColumnDef<CheckerRow>[] = [
	{
		accessorKey: "user_name",
		header: "Checked by",
		meta: { mobileCard: { slot: "title" } },
	},
	{
		id: "card_checks",
		header: "Checks",
		meta: {
			...CARD_ONLY,
			mobileCard: { slot: "title-end", className: "tabular-nums" },
		},
		cell: ({ row }) => plural(row.original.checks, "check"),
	},
	{
		id: "checks",
		header: "Checks",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => numberFormatter.format(row.original.checks),
	},
	{
		id: "rejects",
		header: "Rejected",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => numberFormatter.format(row.original.rejects),
	},
	{
		id: "reject_rate",
		header: "Reject rate",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => percentFormatter.format(row.original.reject_rate),
	},
	{
		id: "self_check_rate",
		header: "Self-checked",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
		cell: ({ row }) => percentFormatter.format(row.original.self_check_rate),
	},
	{
		id: "complaints_after",
		header: "Complaints after",
		meta: { ...NUMERIC, mobileCard: { slot: "hidden" } },
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
			`${numberFormatter.format(row.original.rejects)} rejected · ${percentFormatter.format(row.original.self_check_rate)} self-checked · ${numberFormatter.format(row.original.complaints_after)} complaints after`,
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
			cellClassName: "whitespace-nowrap tabular-nums",
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) => formatDay(row.original.refunded_at),
	},
	...itemLineColumns<DamagedLostRow>(),
	{
		id: "reason",
		header: "Reason",
		meta: { mobileCard: { slot: "badges" } },
		cell: ({ row }) => (
			<Badge variant={row.original.reason === "lost" ? "danger" : "warning"}>
				{DAMAGED_LOST_LABELS[row.original.reason]}
			</Badge>
		),
	},
	{
		id: "amount",
		header: "Amount",
		meta: { ...NUMERIC, mobileCard: { slot: "footer" } },
		cell: ({ row }) => formatMoney(row.original.amount),
	},
	{
		id: "note",
		header: "Note",
		cell: ({ row }) => <LongText text={row.original.note} />,
	},
];

interface ReportSectionProps {
	id: string;
	title: ReactNode;
	aside?: ReactNode;
	children: ReactNode;
}

const ReportSection = ({ id, title, aside, children }: ReportSectionProps) => (
	<section aria-labelledby={id} className="grid gap-3">
		<div className="flex min-h-8 items-center justify-between gap-3">
			<h2 id={id} className={HEADING_CLASS}>
				{title}
			</h2>
			{aside}
		</div>
		{children}
	</section>
);

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

	return (
		<ReportSection
			id="quality-qc-rejects"
			title={
				<>
					QC rejects
					{query.data ? (
						<span className="text-foreground tabular-nums">
							{numberFormatter.format(total)}
						</span>
					) : null}
				</>
			}
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
			<div className="lg:border lg:border-border">
				<DataTable
					columns={qcRejectColumns}
					data={query.data?.items ?? []}
					isLoading={query.isPending}
					emptyMessage="No QC rejects in range."
					getCardLink={orderCardLink}
				/>
			</div>
			{isShowingAll ? (
				<TablePagination
					meta={query.data?.meta}
					isLoading={query.isFetching}
					onPageChange={(page) => setOffset((page - 1) * PAGE_SIZE)}
				/>
			) : null}
		</ReportSection>
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
				<span className="truncate text-sm font-medium">{label}</span>
				<span className="flex items-center gap-3 text-sm tabular-nums">
					<span>{numberFormatter.format(count)}</span>
					<span className="w-14 text-right text-muted-foreground">
						{percentFormatter.format(share)}
					</span>
				</span>
			</div>
			<div className="h-1.5 w-full bg-muted">
				<div
					className="h-full bg-foreground"
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
		<ReportSection id="quality-caught" title="Where mistakes were caught">
			<ul className="grid gap-3 border border-border p-4">
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
						<p className="text-[11px] tabular-nums text-muted-foreground">
							{outcomeLine}
						</p>
					)}
				</CaughtBar>
			</ul>
		</ReportSection>
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
		"Quality checks,Checked by,Checks,Rejected,Reject rate,Self-checks,Self-check rate,Complaints after",
	);
	for (const c of data.by_checker) {
		lines.push(
			`Quality checks,${escapeCsv(c.user_name)},${c.checks},${c.rejects},${c.reject_rate},${c.self_checks},${c.self_check_rate},${c.complaints_after}`,
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

const QualitySkeleton = () => (
	<div className="grid gap-6">
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{Array.from({ length: 4 }, (_, index) => (
				<div key={index} className="h-24 animate-pulse bg-muted/40" />
			))}
		</div>
		<div className="h-48 animate-pulse bg-muted/40" />
	</div>
);

interface QualitySectionsProps {
	range: RangeQuery;
}

const QualitySections = ({ range }: QualitySectionsProps) => {
	const queryClient = useQueryClient();
	const query = useQuery(reportsQueries.quality(range));
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

	if (!data) {
		return <QualitySkeleton />;
	}

	const { current, deltas } = data.summary;

	return (
		<>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<KpiRow>
					<KpiCard
						label="First-pass rate"
						value={percentFormatter.format(current.first_pass_rate)}
						delta={deltas.first_pass_rate}
						deltaAs="points"
					/>
					<KpiCard
						label="QC rejects"
						value={numberFormatter.format(current.qc_rejects)}
						delta={deltas.qc_rejects}
						isLowerBetter
					/>
					<KpiCard
						label="Complaint rate"
						value={percentFormatter.format(current.complaint_rate)}
						delta={deltas.complaint_rate}
						deltaAs="points"
						helper="so far"
						isLowerBetter
					/>
					<KpiCard
						label="Self-checked"
						value={percentFormatter.format(current.self_check_rate)}
						delta={deltas.self_check_rate}
						deltaAs="points"
						helper="of passes"
						isLowerBetter
					/>
				</KpiRow>
				<ExportButton
					disabled={exportMutation.isPending}
					onClick={() => exportMutation.mutate(data)}
				/>
			</div>

			<CaughtSection summary={current} outcomes={data.complaint_outcomes} />

			<ReportSection id="quality-by-service" title="By Service">
				<div className="lg:border lg:border-border">
					<DataTable
						columns={serviceColumns}
						data={data.by_service}
						emptyMessage="No Services processed in range."
					/>
				</div>
			</ReportSection>

			<ReportSection id="quality-by-checker" title="Quality checks by person">
				<div className="lg:border lg:border-border">
					<DataTable
						columns={checkerColumns}
						data={data.by_checker}
						emptyMessage="No quality checks in range."
					/>
				</div>
			</ReportSection>

			<ReportSection id="quality-damaged-lost" title="Damaged & lost">
				<div className="lg:border lg:border-border">
					<DataTable
						columns={damagedLostColumns}
						data={data.damaged_lost}
						emptyMessage="None in range."
						getCardLink={orderCardLink}
					/>
				</div>
			</ReportSection>
		</>
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

export default QualityPanel;
