import { Section } from "@/components/section";
import type { QualityReport } from "@/features/reports/api";
import { KpiCard, KpiRow } from "@/features/reports/components/kpi-card";
import { QcPerDayChart } from "@/features/reports/components/qc-per-day-chart";
import { QcRejectsList } from "@/features/reports/components/qc-rejects-sheet";
import {
	numberFormatter,
	oneDecimalFormatter,
	rangeLabel,
} from "@/features/reports/utils/format";
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
	return (target: CheckerSheetTarget, qcOffset = 0) =>
		openSheet({
			title: target.row.user_name,
			description: `Checker · ${rangeLabel(target.from, target.to)}`,
			content: () => (
				<CheckerSheetContent target={target} qcOffset={qcOffset} />
			),
		});
};

interface CheckerSheetContentProps {
	target: CheckerSheetTarget;
	qcOffset: number;
}

const CheckerSheetContent = ({
	target,
	qcOffset,
}: CheckerSheetContentProps) => {
	const openCheckerSheet = useOpenCheckerSheet();
	const { row } = target;
	return (
		<div className="grid gap-5">
			<KpiRow>
				<KpiCard label="Checks" value={numberFormatter.format(row.checks)} />
				<KpiCard
					label="Per day"
					value={oneDecimalFormatter.format(row.per_day)}
				/>
				<KpiCard label="Rejects" value={numberFormatter.format(row.rejects)} />
				<KpiCard
					label="Self-passed"
					value={numberFormatter.format(row.self_checks)}
				/>
			</KpiRow>

			<Section title="Checks Each Day">
				<QcPerDayChart rows={row.days} bucket={target.bucket} />
			</Section>

			<Section title="QC Rejects" count={numberFormatter.format(row.rejects)}>
				<QcRejectsList
					key={row.user_id}
					initialOffset={qcOffset}
					back={{
						label: row.user_name,
						onClick: (offset) => openCheckerSheet(target, offset),
					}}
					target={{
						from: target.from,
						to: target.to,
						storeId: target.storeId,
						checkerId: row.user_id,
					}}
				/>
			</Section>
		</div>
	);
};
