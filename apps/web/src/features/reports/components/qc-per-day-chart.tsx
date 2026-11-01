import {
	type ChartSeries,
	dateAxis,
	headParts,
	ReportChart,
	valueAt,
} from "@/features/reports/components/report-chart";
import { numberFormatter } from "@/features/reports/utils/format";
import { QC_COLORS } from "@/features/reports/utils/palette";

interface QcDayRow {
	label: string;
	// Left out on a checker's own chart, where only their checks show.
	arrived?: number;
	passes: number;
	qc_rejects: number;
}

interface QcPerDayChartProps {
	rows: QcDayRow[];
	bucket: "day" | "week";
	caption: string;
}

const count = (value: number) => numberFormatter.format(value);

// Arrivals on the QC shelf beside the checks made: a grey bar taller than its
// neighbour is a day the pile grew.
export const QcPerDayChart = ({
	rows,
	bucket,
	caption,
}: QcPerDayChartProps) => {
	const axis = dateAxis(bucket);
	const labels = rows.map((row) => row.label);
	const hasArrivals = rows.some((row) => row.arrived !== undefined);
	const arrived: ChartSeries = {
		key: "arrived",
		name: "Arrived",
		color: QC_COLORS.arrived,
		values: rows.map((row) => row.arrived ?? 0),
	};
	const checked: ChartSeries[] = [
		{
			key: "passes",
			name: "Passed",
			color: QC_COLORS.passes,
			values: rows.map((row) => row.passes),
		},
		{
			key: "qc_rejects",
			name: "QC rejects",
			color: QC_COLORS.qcRejects,
			values: rows.map((row) => row.qc_rejects),
		},
	];
	const shown = hasArrivals ? [arrived, ...checked] : checked;

	return (
		<ReportChart
			labels={labels}
			axis={axis}
			groups={hasArrivals ? [[arrived], checked] : [checked]}
			formatAxis={count}
			head={(index) => {
				const checks = checked.reduce((sum, s) => sum + valueAt(s, index), 0);
				const pile = valueAt(arrived, index) - checks;
				const parts = headParts(shown, index, count);
				const day = index === null ? null : axis.title(labels[index]);
				return hasArrivals
					? {
							label: day ?? "Pile",
							value: `${pile > 0 ? "+" : ""}${count(pile)}`,
							unit: "Items",
							caption:
								day === null
									? `Arrived minus checked · ${caption}`
									: "Arrived minus checked",
							parts,
						}
					: {
							label: day ?? "Checks",
							value: count(checks),
							caption: day === null ? caption : "Checks",
							parts,
						};
			}}
		/>
	);
};
