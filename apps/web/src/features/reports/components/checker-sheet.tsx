import { CancelCircleIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import { Skeleton } from "@/components/ui/skeleton";
import {
	QC_REJECTS_PAGE_SIZE,
	type QualityReport,
	reportsQueries,
} from "@/features/reports/api";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { QcPerDayChart } from "@/features/reports/components/qc-per-day-chart";
import {
	DETAIL_CLASS,
	ROW_CLASS,
	sheetRangeLabel,
	shortDay,
} from "@/features/reports/components/worker-sheet";
import {
	numberFormatter,
	oneDecimalFormatter,
} from "@/features/reports/utils/format";
import { outOf } from "@/features/reports/utils/workers-report";
import { useLeaveSheetLink } from "@/hooks/useLeaveSheetLink";
import { useSheet } from "@/stores/sheet-store";

type CheckerRow = QualityReport["by_checker"][number];

interface CheckerSheetTarget {
	from: string;
	to: string;
	storeId?: number;
	bucket: QualityReport["daily"]["bucket"];
	row: CheckerRow;
}

export const useOpenCheckerSheet = () => {
	const openSheet = useSheet((s) => s.openSheet);
	return useCallback(
		(target: CheckerSheetTarget) =>
			openSheet({
				title: target.row.user_name,
				description: `Checker · ${sheetRangeLabel(target.from, target.to)}`,
				size: "wide",
				content: () => <CheckerSheetContent target={target} />,
			}),
		[openSheet],
	);
};

interface CheckerRejectsProps {
	target: CheckerSheetTarget;
}

const CheckerRejects = ({ target }: CheckerRejectsProps) => {
	const leaveSheet = useLeaveSheetLink();
	const query = useQuery(
		reportsQueries.qcRejects({
			from: target.from,
			to: target.to,
			store_id: target.storeId,
			checker_id: target.row.user_id,
			limit: QC_REJECTS_PAGE_SIZE,
			offset: 0,
		}),
	);
	if (query.isPending) {
		return <Skeleton className="h-24 w-full rounded-lg" />;
	}
	const items = query.data?.items ?? [];
	if (items.length === 0) {
		return (
			<EmptyState icon={CancelCircleIcon}>No QC rejects in range.</EmptyState>
		);
	}
	return (
		<ul className="rounded-lg border bg-card px-3">
			{items.map((item) => (
				<li key={item.id} className={ROW_CLASS}>
					<span className="text-muted-foreground tabular-nums">
						{shortDay(item.rejected_at)}
					</span>
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(item.order_id) }}
						onClick={leaveSheet}
						className="text-link tabular-nums"
					>
						{item.item_code}
					</Link>
					<span className={DETAIL_CLASS}>
						{[
							item.service_name,
							item.reason,
							`cleaned by ${item.cleaned_by_name ?? "—"}`,
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				</li>
			))}
		</ul>
	);
};

interface CheckerSheetContentProps {
	target: CheckerSheetTarget;
}

const CheckerSheetContent = ({ target }: CheckerSheetContentProps) => {
	const { row } = target;
	return (
		<div className="grid gap-5">
			<KpiRow>
				<KpiCard label="Checks" value={numberFormatter.format(row.checks)} />
				<KpiCard
					label="Per day"
					value={oneDecimalFormatter.format(row.per_day)}
				/>
				<KpiCard label="QC rejects" value={outOf(row.rejects, row.checks)} />
				<KpiCard
					label="Self-checks"
					value={numberFormatter.format(row.self_checks)}
				/>
			</KpiRow>

			<Section title="Checks Each Day">
				<QcPerDayChart rows={row.days} bucket={target.bucket} />
			</Section>

			<Section title="QC Rejects" count={numberFormatter.format(row.rejects)}>
				<CheckerRejects target={target} />
			</Section>
		</div>
	);
};
