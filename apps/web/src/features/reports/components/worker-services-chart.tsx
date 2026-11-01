import type { WorkerDetailReport } from "@/features/reports/api";
import {
	type ChartSeries,
	dateAxis,
	headParts,
	ReportChart,
	valueAt,
} from "@/features/reports/components/report-chart";
import {
	numberFormatter,
	oneDecimalFormatter,
	rangeLabel,
} from "@/features/reports/utils/format";
import {
	CHART_OTHER_COLOR,
	topFourColor,
} from "@/features/reports/utils/palette";
import { buildChartRows } from "@/features/reports/utils/workers-report";

// The worker's biggest Services in colour; everything else is grey.
export const serviceColor = (topIds: number[], serviceId: number) => {
	const index = topIds.indexOf(serviceId);
	return index === -1 ? CHART_OTHER_COLOR : topFourColor(index);
};

interface WorkerServicesChartProps {
	data: WorkerDetailReport;
	topIds: number[];
	from: string;
	to: string;
}

const count = (value: number) => numberFormatter.format(value);

export const WorkerServicesChart = ({
	data,
	topIds,
	from,
	to,
}: WorkerServicesChartProps) => {
	const axis = dateAxis(data.bucket);
	const rows = buildChartRows(data.buckets, topIds);
	const labels = rows.map((row) => row.label);
	const names = new Map(
		data.services.map((s) => [s.service_id, s.service_name]),
	);
	const series: ChartSeries[] = [
		...topIds.map((id, index) => ({
			key: String(id),
			name: names.get(id) ?? "Service",
			color: topFourColor(index),
			values: rows.map((row) => row.slices[index]),
		})),
		{
			key: "other",
			name: "Other",
			color: CHART_OTHER_COLOR,
			values: rows.map((row) => row.other),
		},
	];

	return (
		<ReportChart
			labels={labels}
			axis={axis}
			groups={[series]}
			average={{
				name: "Store average",
				values: rows.map((row) => row.storeAverage),
			}}
			formatAxis={count}
			head={(index) => {
				const parts = headParts(series, index, count);
				if (index === null) {
					const total = series.reduce((sum, s) => sum + valueAt(s, null), 0);
					return {
						label: "Services",
						value: count(total),
						caption: rangeLabel(from, to),
						parts,
					};
				}
				const row = rows[index];
				const average =
					row.storeAverage === null
						? ""
						: ` · Store average ${oneDecimalFormatter.format(row.storeAverage)}`;
				return {
					label: axis.title(row.label),
					value: row.total === null ? "—" : count(row.total),
					caption:
						row.total === null
							? "Not worked"
							: `${row.total === 0 ? "Worked, nothing reached QC" : "Services"}${average}`,
					parts,
				};
			}}
		/>
	);
};
