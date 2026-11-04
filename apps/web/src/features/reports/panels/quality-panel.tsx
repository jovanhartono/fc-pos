import {
	Alert02Icon,
	TaskDone01Icon,
	ToolsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	keepPreviousData,
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { Section } from "@/components/section";
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
import { useOpenComplaintsSheet } from "@/features/reports/components/complaints-sheet";
import { ExportButton } from "@/features/reports/components/export-button";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import {
	type NeedsALookItem,
	NeedsALookList,
} from "@/features/reports/components/needs-a-look";
import {
	Pace,
	PersonName,
	paceText,
} from "@/features/reports/components/person-cells";
import { QcPerDayChart } from "@/features/reports/components/qc-per-day-chart";
import { useOpenQcRejectsSheet } from "@/features/reports/components/qc-rejects-sheet";
import { BadCount } from "@/features/reports/components/tone-chip";
import {
	HelpHeader,
	OpenArrow,
} from "@/features/reports/components/workers-table";
import {
	csvFilename,
	downloadCsv,
	escapeCsv,
} from "@/features/reports/utils/csv";
import {
	numberFormatter,
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

interface QualityPanelProps {
	from: string;
	to: string;
	storeId?: number;
}

type ServiceRow = QualityReport["by_service"][number];
type CheckerRow = QualityReport["by_checker"][number];
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

const formatWhen = (value: string) =>
	dayjs(value).tz(JAKARTA_TZ).format("D MMM HH:mm");

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
		cell: ({ row }) =>
			row.original.processed === 0
				? "—"
				: percentFormatter.format(row.original.first_pass_rate),
	},
	{
		id: "qc_rejects",
		header: "QC rejects",
		meta: {
			align: "right",
			width: { percent: 15, minRem: 5.5 },
			mobileCard: { slot: "hidden" },
		},
		cell: ({ row }) =>
			row.original.qc_rejects === 0 ? (
				<span className="text-muted-foreground">0</span>
			) : (
				<Badge className="tabular-nums" variant="danger">
					{numberFormatter.format(row.original.qc_rejects)}
				</Badge>
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
			`${numberFormatter.format(row.original.processed)} done · ${pluralCount(row.original.qc_rejects, "QC reject")} · ${pluralCount(row.original.complaints, "complaint")}`,
	},
];

type CheckerCounts = Pick<
	CheckerRow,
	| "checks"
	| "days_checked"
	| "passes"
	| "rejects"
	| "self_checks"
	| "complaints_after"
>;

const teamOf = (rows: readonly CheckerRow[]): CheckerCounts =>
	rows.reduce(
		(team, row) => ({
			checks: team.checks + row.checks,
			days_checked: team.days_checked + row.days_checked,
			passes: team.passes + row.passes,
			rejects: team.rejects + row.rejects,
			self_checks: team.self_checks + row.self_checks,
			complaints_after: team.complaints_after + row.complaints_after,
		}),
		{
			checks: 0,
			days_checked: 0,
			passes: 0,
			rejects: 0,
			self_checks: 0,
			complaints_after: 0,
		},
	);

// One checker's average day, so a slow checker reads against it.
const teamPace = (team: CheckerCounts) =>
	team.days_checked === 0 ? null : team.checks / team.days_checked;

// Self-passed and Complaints are out of passes: only a pass can be your own
// work or come back from a customer. `flag` names an outlier, from `minCount`
// up so one slip on a quiet week doesn't read as a habit.
const QUALITY_RATES = [
	{
		id: "pass_rate",
		label: "Pass rate",
		help: "Checks passed. The line under it counts the rest, sent back to the worker.",
		part: (c: CheckerCounts) => c.passes,
		whole: (c: CheckerCounts) => c.checks,
		detail: (c: CheckerCounts) =>
			`${numberFormatter.format(c.rejects)} rejected`,
		hasZeroDetail: (c: CheckerCounts) => c.rejects === 0,
		isBad: false,
		// A checker who rejects a lot may just be strict.
		flag: null,
		minCount: 0,
	},
	{
		id: "self_checks",
		label: "Self-passed",
		help: "Passes on Services the checker cleaned themselves.",
		part: (c: CheckerCounts) => c.self_checks,
		whole: (c: CheckerCounts) => c.passes,
		detail: (c: CheckerCounts) => pluralCount(c.self_checks, "own Service"),
		hasZeroDetail: (c: CheckerCounts) => c.self_checks === 0,
		isBad: true,
		flag: "self-passes a lot",
		minCount: 3,
	},
	{
		id: "complaints_after",
		label: "Complaints",
		help: "Passes that came back as a Complaint.",
		part: (c: CheckerCounts) => c.complaints_after,
		whole: (c: CheckerCounts) => c.passes,
		detail: (c: CheckerCounts) => pluralCount(c.complaints_after, "Complaint"),
		hasZeroDetail: (c: CheckerCounts) => c.complaints_after === 0,
		isBad: true,
		flag: "many Complaints",
		minCount: 2,
	},
] as const;

type QualityRate = (typeof QUALITY_RATES)[number];

const rateOf = (rate: QualityRate, counts: CheckerCounts) => {
	const whole = rate.whole(counts);
	return whole === 0 ? null : rate.part(counts) / whole;
};

// Twice the team's rate, or under half its pace, is worth the owner's look.
const OUTLIER_FACTOR = 2;
const MIN_PACE_DAYS = 3;

const outlierFlags = (row: CheckerRow, team: CheckerCounts) => {
	const flags: string[] = [];
	const pace = teamPace(team);
	if (
		pace !== null &&
		row.days_checked >= MIN_PACE_DAYS &&
		row.per_day < pace / OUTLIER_FACTOR
	) {
		flags.push(`slow · team ${paceText(pace)}`);
	}
	for (const rate of QUALITY_RATES) {
		const value = rateOf(rate, row);
		const teamValue = rateOf(rate, team);
		if (
			rate.flag &&
			value !== null &&
			teamValue !== null &&
			rate.part(row) >= rate.minCount &&
			value >= teamValue * OUTLIER_FACTOR
		) {
			flags.push(rate.flag);
		}
	}
	return flags;
};

interface OutlierLineProps {
	flags: string[];
}

const OutlierLine = ({ flags }: OutlierLineProps) =>
	flags.length === 0 ? null : (
		<span className="inline-flex items-center gap-1 text-subhead text-tone-warn-foreground">
			<HugeiconsIcon
				icon={Alert02Icon}
				aria-hidden="true"
				className="size-3.5 shrink-0"
			/>
			{flags.join(" · ")}
		</span>
	);

interface CheckerNameProps {
	row: CheckerRow;
	rows: readonly CheckerRow[];
}

const CheckerName = ({ row, rows }: CheckerNameProps) => (
	<PersonName
		name={row.user_name}
		detail={<OutlierLine flags={outlierFlags(row, teamOf(rows))} />}
	>
		{row.user_name}
	</PersonName>
);

interface RateProps {
	rate: QualityRate;
	counts: CheckerCounts;
	// The Team row is the yardstick, not a person to flag.
	isTeam?: boolean;
}

// The rate on top and its count under it, like Pace; a zero needs no line.
const Rate = ({ rate, counts, isTeam = false }: RateProps) => {
	const value = rateOf(rate, counts);
	if (value === null) {
		return <span className="text-muted-foreground">—</span>;
	}
	const isZero = rate.hasZeroDetail(counts);
	return (
		<span className="grid gap-0.5 tabular-nums">
			<span
				className={cn(
					rate.isBad &&
						!isTeam &&
						(isZero ? "text-muted-foreground" : "text-tone-bad-foreground"),
				)}
			>
				{percentFormatter.format(value)}
			</span>
			{!isZero && (
				<span className="font-normal text-muted-foreground text-subhead">
					{rate.detail(counts)}
				</span>
			)}
		</span>
	);
};

const checkerColumns: DataTableColumnDef<CheckerRow>[] = [
	{
		accessorKey: "user_name",
		header: "Checked by",
		meta: { width: { percent: 28, minRem: 11 } },
		cell: ({ row, table }) => (
			<CheckerName row={row.original} rows={table.options.data} />
		),
		footer: "Team",
	},
	{
		id: "checks",
		header: "Checks",
		meta: { align: "right", width: { percent: 10, minRem: 4.5 } },
		cell: ({ row }) => (
			<span className="font-medium">
				{numberFormatter.format(row.original.checks)}
			</span>
		),
		footer: ({ table }) =>
			numberFormatter.format(teamOf(table.options.data).checks),
	},
	{
		id: "pace",
		header: "Pace",
		meta: { align: "right", width: { percent: 12, minRem: 5.5 } },
		cell: ({ row }) => (
			<Pace perDay={row.original.per_day} days={row.original.days_checked} />
		),
		footer: ({ table }) => (
			<span className="grid gap-0.5">
				<span>{paceText(teamPace(teamOf(table.options.data)))}</span>
				<span className="font-normal text-muted-foreground text-subhead">
					per checker
				</span>
			</span>
		),
	},
	...QUALITY_RATES.map(
		(rate): DataTableColumnDef<CheckerRow> => ({
			id: rate.id,
			header: () => <HelpHeader label={rate.label} help={rate.help} />,
			meta: { align: "right", width: { percent: 15, minRem: 6 } },
			cell: ({ row }) => <Rate rate={rate} counts={row.original} />,
			footer: ({ table }) => (
				<Rate rate={rate} counts={teamOf(table.options.data)} isTeam />
			),
		}),
	),
	{
		id: "open",
		header: () => <span className="sr-only">Open</span>,
		meta: { width: { percent: 5, minRem: 1.75 } },
		cell: () => <OpenArrow />,
	},
];

interface CheckerCardProps {
	row: CheckerRow;
	rows: readonly CheckerRow[];
	onOpen: (row: CheckerRow) => void;
}

// Same shape as a Workers phone card: the count up top, the rates in tiles.
const CheckerCard = ({ row, rows, onOpen }: CheckerCardProps) => (
	<button
		type="button"
		onClick={() => onOpen(row)}
		className="grid w-full gap-2 px-4 py-3 text-left text-body tabular-nums active:bg-muted/40"
	>
		<span className="flex items-center gap-2">
			<span className="min-w-0 flex-1">
				<CheckerName row={row} rows={rows} />
			</span>
			<span>
				<span className="font-medium">
					{numberFormatter.format(row.checks)}
				</span>
				<span className="ml-1 text-muted-foreground">
					{row.checks === 1 ? "check" : "checks"}
				</span>
			</span>
			<OpenArrow />
		</span>
		<span className="text-muted-foreground text-subhead">
			{`${paceText(row.per_day)} · ${pluralCount(row.days_checked, "day")}`}
		</span>
		<span className="grid grid-cols-3 gap-2">
			{QUALITY_RATES.map((rate) => (
				<span
					key={rate.id}
					className="grid content-start gap-0.5 rounded-md bg-muted/50 px-2.5 py-2"
				>
					<span className="text-muted-foreground text-subhead">
						{rate.label}
					</span>
					<Rate rate={rate} counts={row} />
				</span>
			))}
		</span>
	</button>
);

interface CheckerTeamLineProps {
	rows: CheckerRow[];
}

// The desktop table closes with a Team row; a phone gets the same as one line.
const CheckerTeamLine = ({ rows }: CheckerTeamLineProps) => {
	const team = teamOf(rows);
	if (team.checks === 0) {
		return null;
	}
	const facts = [
		`${numberFormatter.format(team.checks)} checks`,
		paceText(teamPace(team)),
		...QUALITY_RATES.map(
			(rate) =>
				`${percentFormatter.format(rateOf(rate, team) ?? 0)} ${rate.label === "Pass rate" ? "passed" : rate.label}`,
		),
	];
	return (
		<p className="px-1 pt-2 text-muted-foreground text-subhead tabular-nums lg:hidden">
			<span className="font-medium text-foreground">Team</span>
			{facts.map((fact) => ` · ${fact}`).join("")}
		</p>
	);
};

interface QcPerDaySectionProps {
	data: QualityReport;
}

const QcPerDaySection = ({ data }: QcPerDaySectionProps) => (
	<Section id="quality-per-day" title="QC per Day">
		<div className="rounded-lg border bg-card p-4">
			<QcPerDayChart rows={data.daily.rows} bucket={data.daily.bucket} />
		</div>
	</Section>
);

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
	// One line for everyone, so a Store full of self-passes doesn't bury the
	// pile; the Checkers table says who.
	const selfCheckers = data.by_checker.filter((row) => row.self_checks > 0);
	if (selfCheckers.length > 0) {
		flags.push({
			key: "self-check",
			name: "Self-passed",
			before: `${pluralCount(selfCheckers.length, "checker")} `,
			problem: `passed ${pluralCount(
				selfCheckers.reduce((sum, row) => sum + row.self_checks, 0),
				"Item",
			)} they cleaned`,
			after: " · see Checkers below",
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
	onOpen: () => void;
}

const MistakeRow = ({
	label,
	count,
	color,
	detail,
	onOpen,
}: MistakeRowProps) => (
	<li>
		<button
			type="button"
			onClick={onOpen}
			className="-m-2 flex w-[calc(100%+1rem)] cursor-pointer items-start justify-between gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted active:bg-muted"
		>
			<span className="grid gap-0.5">
				<span className="flex items-center gap-2 text-body">
					<span
						aria-hidden="true"
						className="size-2 rounded-full"
						style={{ backgroundColor: color }}
					/>
					{label}
				</span>
				<span className="pl-4 text-muted-foreground text-subhead">
					{detail}
				</span>
			</span>
			<span className="flex items-center gap-1 font-medium text-body text-link tabular-nums [&_svg]:text-link">
				{numberFormatter.format(count)}
				<OpenArrow />
			</span>
		</button>
	</li>
);

interface MistakesSectionProps {
	data: QualityReport;
}

// Every QC reject made in the range, whenever the work was done, beside the
// Complaints on this range's work.
const MistakesSection = ({ data }: MistakesSectionProps) => {
	const openQcRejectsSheet = useOpenQcRejectsSheet();
	const openComplaintsSheet = useOpenComplaintsSheet();
	const { mistakes, complaint_outcomes: outcomes } = data;
	const outcomeLine = OUTCOMES.filter((key) => outcomes[key] > 0)
		.map((key) => `${key} ${numberFormatter.format(outcomes[key])}`)
		.join(" · ");
	return (
		<Section id="quality-mistakes" title="Mistakes">
			<div className="grid gap-3.5 rounded-lg border bg-card p-4">
				<p className="font-medium text-title-1 tabular-nums">
					{pluralCount(mistakes.total, "mistake")}
				</p>
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
						onOpen={() =>
							openQcRejectsSheet({
								from: data.from,
								to: data.to,
								storeId: data.store_id ?? undefined,
							})
						}
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
						onOpen={() => openComplaintsSheet(data)}
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
	["first_pass_rate", "First-pass rate"],
	["complaints", "Complaints"],
	["complaint_rate", "Complaint rate"],
	["qc_rejects", "QC rejects"],
	["passes", "QC passes"],
	["self_checks", "Self-passed"],
	["self_check_rate", "Self-pass rate"],
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
			`By Service,${escapeCsv(s.service_name)},${s.processed},${s.first_pass},${s.first_pass_rate},${s.qc_rejects},${s.complaints}`,
		);
	}
	lines.push(
		"",
		"Checkers,Checked by,Checks,Days checked,Per day,Pass rate,Rejects,Self-pass rate,Self-passed,Complaint rate,Complaints",
	);
	const [passRate, selfCheckRate, complaintRate] = QUALITY_RATES.map(
		(rate) => (c: CheckerCounts) => (rateOf(rate, c) ?? 0).toFixed(4),
	);
	const checkerLine = (name: string, c: CheckerCounts, perDay: number | null) =>
		`Checkers,${escapeCsv(name)},${c.checks},${c.days_checked},${perDay === null ? "" : perDay.toFixed(1)},${passRate(c)},${c.rejects},${selfCheckRate(c)},${c.self_checks},${complaintRate(c)},${c.complaints_after}`;
	for (const c of data.by_checker) {
		lines.push(checkerLine(c.user_name, c, c.per_day));
	}
	const team = teamOf(data.by_checker);
	lines.push(checkerLine("Team", team, teamPace(team)));
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
					<QcPerDaySection data={data} />

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
								<CheckerCard
									row={row}
									rows={data.by_checker}
									onOpen={handleOpenChecker}
								/>
							)}
						/>
						<CheckerTeamLine rows={data.by_checker} />
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
		</div>
	);
};
