import { useCallback, useState } from "react";
import {
	Bar,
	CartesianGrid,
	ComposedChart,
	Line,
	XAxis,
	YAxis,
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { WorkerDetailReport } from "@/features/reports/api";
import { oneDecimalFormatter } from "@/features/reports/utils/format";
import {
	axisTickLabels,
	buildChartRows,
	type ChartRow,
} from "@/features/reports/utils/workers-report";
import dayjs from "@/lib/dayjs";
import { pluralize } from "@/shared/utils";

// Soft colours for the worker's biggest Services; everything else is grey.
const SERVICE_COLORS = [
	"oklch(0.76 0.11 255)",
	"oklch(0.84 0.09 170)",
	"oklch(0.87 0.1 80)",
	"oklch(0.8 0.1 350)",
];
const OTHER_COLOR = "var(--chart-other)";
const AVERAGE_COLOR = "var(--chart-average)";

export const serviceColor = (topIds: number[], serviceId: number) => {
	const index = topIds.indexOf(serviceId);
	return index === -1 ? OTHER_COLOR : SERVICE_COLORS[index];
};

const bucketTitle = (label: string, bucket: WorkerDetailReport["bucket"]) =>
	bucket === "day"
		? dayjs(label).format("ddd D MMM")
		: `Week of ${dayjs(label).format("D MMM")}`;

interface BucketTipProps {
	row: ChartRow | undefined;
	topIds: number[];
	bucket: WorkerDetailReport["bucket"];
	maxWidth: number;
}

const BucketTip = ({ row, topIds, bucket, maxWidth }: BucketTipProps) => {
	if (!row) {
		return null;
	}
	const average = row.storeAverage !== null && (
		<p className="mt-1.5 border-border border-t pt-1.5 text-muted-foreground">
			{`Store average ${oneDecimalFormatter.format(row.storeAverage)}`}
		</p>
	);
	return (
		<div
			className="border border-border bg-background px-2.5 py-2 text-xs shadow-lg"
			style={{ maxWidth }}
		>
			<p className="font-medium">{bucketTitle(row.label, bucket)}</p>
			{row.total === null ? (
				<p className="text-muted-foreground">not worked</p>
			) : (
				<p className="tabular-nums">
					{row.total === 0
						? "worked, nothing reached QC"
						: pluralize(row.total, "Service")}
				</p>
			)}
			<ul className="mt-1 grid gap-0.5 tabular-nums">
				{row.services.map((service) => (
					<li key={service.service_id} className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="size-2.5 shrink-0"
							style={{
								backgroundColor: serviceColor(topIds, service.service_id),
							}}
						/>
						<span className="min-w-0 flex-1">{service.service_name}</span>
						<span>{service.count}</span>
					</li>
				))}
			</ul>
			{average}
		</div>
	);
};

interface WorkerServicesChartProps {
	data: WorkerDetailReport;
	topIds: number[];
}

export const WorkerServicesChart = ({
	data,
	topIds,
}: WorkerServicesChartProps) => {
	// The tooltip steps one bar-width plus a gap away from the pointer, so it
	// never covers the bar being read.
	const [width, setWidth] = useState(0);
	const measure = useCallback((element: HTMLDivElement | null) => {
		if (!element) {
			return;
		}
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const rows = buildChartRows(data.buckets, topIds);
	const rowByLabel = new Map(rows.map((row) => [row.label, row]));
	const ticks = axisTickLabels(
		rows.map((row) => row.label),
		data.bucket,
	);
	const lastAverage = rows.reduce(
		(last, row, index) => (row.storeAverage === null ? last : index),
		-1,
	);
	const slot = rows.length > 0 ? Math.max(width - 40, 0) / rows.length : 0;

	return (
		<div ref={measure}>
			<ChartContainer config={{}} className="aspect-auto h-64 w-full">
				<ComposedChart
					data={rows}
					margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
				>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="label"
						ticks={ticks}
						interval={0}
						tickLine={false}
						tickMargin={6}
						tickFormatter={(label: string) => dayjs(label).format("D MMM")}
					/>
					<YAxis
						allowDecimals={false}
						tickLine={false}
						axisLine={false}
						width={28}
					/>
					<ChartTooltip
						cursor={{ fill: "var(--muted)" }}
						offset={slot + 12}
						content={({ label }) => (
							<BucketTip
								row={rowByLabel.get(String(label))}
								topIds={topIds}
								bucket={data.bucket}
								// On a phone the chart is narrower than the tooltip; it may
								// cover the bar there, but never runs off the screen.
								maxWidth={Math.min(280, Math.max(width - 36, 160))}
							/>
						)}
					/>
					{topIds.map((id, index) => (
						<Bar
							key={id}
							dataKey={(row: ChartRow) => row.slices[index]}
							stackId="services"
							fill={SERVICE_COLORS[index]}
							isAnimationActive={false}
						/>
					))}
					<Bar
						dataKey="other"
						stackId="services"
						fill={OTHER_COLOR}
						isAnimationActive={false}
					/>
					<Line
						dataKey="storeAverage"
						stroke={AVERAGE_COLOR}
						strokeWidth={2}
						dot={false}
						activeDot={false}
						connectNulls={false}
						isAnimationActive={false}
						label={({ x, y, index }) =>
							index === lastAverage ? (
								<text
									key="average-label"
									x={Number(x)}
									y={Number(y) - 6}
									textAnchor="end"
									fontSize={11}
									fontWeight={500}
									fill={AVERAGE_COLOR}
									stroke="var(--background)"
									strokeWidth={4}
									paintOrder="stroke"
								>
									Store average
								</text>
							) : (
								<g key={`skip-${index}`} />
							)
						}
					/>
				</ComposedChart>
			</ChartContainer>
		</div>
	);
};
