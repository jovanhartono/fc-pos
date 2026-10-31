import { useCallback, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { numberFormatter } from "@/features/reports/utils/format";
import { QC_COLORS } from "@/features/reports/utils/palette";
import { axisTickLabels } from "@/features/reports/utils/workers-report";
import dayjs from "@/lib/dayjs";

interface QcDayRow {
	label: string;
	// Left out on a checker's own chart, where only their checks show.
	arrived?: number;
	passes: number;
	qc_rejects: number;
}

type Bucket = "day" | "week";

const bucketTitle = (label: string, bucket: Bucket) =>
	bucket === "day"
		? dayjs(label).format("ddd D MMM")
		: `Week of ${dayjs(label).format("D MMM")}`;

interface TipLineProps {
	label: string;
	value: number;
	color: string;
}

const TipLine = ({ label, value, color }: TipLineProps) => (
	<li className="flex items-center gap-2">
		<span
			aria-hidden="true"
			className="size-2 shrink-0 rounded-full"
			style={{ backgroundColor: color }}
		/>
		<span className="min-w-0 flex-1">{label}</span>
		<span>{numberFormatter.format(value)}</span>
	</li>
);

interface DayTipProps {
	row: QcDayRow | undefined;
	bucket: Bucket;
	maxWidth: number;
}

const DayTip = ({ row, bucket, maxWidth }: DayTipProps) => {
	if (!row) {
		return null;
	}
	const checked = row.passes + row.qc_rejects;
	const pile = row.arrived === undefined ? null : row.arrived - checked;
	return (
		<div
			className="border border-border bg-background px-2.5 py-2 text-footnote shadow-lg"
			style={{ maxWidth }}
		>
			<p className="font-medium">{bucketTitle(row.label, bucket)}</p>
			<ul className="mt-1 grid gap-0.5 tabular-nums">
				{row.arrived !== undefined && (
					<TipLine
						label="Arrived"
						value={row.arrived}
						color={QC_COLORS.arrived}
					/>
				)}
				<TipLine label="Passed" value={row.passes} color={QC_COLORS.passes} />
				<TipLine
					label="QC rejects"
					value={row.qc_rejects}
					color={QC_COLORS.qcRejects}
				/>
			</ul>
			{pile !== null && (
				<p className="mt-1.5 flex justify-between gap-2 border-border border-t pt-1.5 font-medium tabular-nums">
					<span>Pile</span>
					<span
						className={
							pile > 0
								? "text-tone-warn-foreground"
								: "text-tone-good-foreground"
						}
					>
						{pile > 0
							? `+${numberFormatter.format(pile)}`
							: numberFormatter.format(pile)}
					</span>
				</p>
			)}
		</div>
	);
};

interface QcPerDayChartProps {
	rows: QcDayRow[];
	bucket: Bucket;
}

// Arrivals on the QC shelf beside the checks made: a taller grey bar than its
// neighbour is a day the pile grew.
export const QcPerDayChart = ({ rows, bucket }: QcPerDayChartProps) => {
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

	const rowByLabel = new Map(rows.map((row) => [row.label, row]));
	const ticks = axisTickLabels(
		rows.map((row) => row.label),
		bucket,
	);
	const slot = rows.length > 0 ? Math.max(width - 40, 0) / rows.length : 0;
	const hasArrivals = rows.some((row) => row.arrived !== undefined);

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
							<DayTip
								row={rowByLabel.get(String(label))}
								bucket={bucket}
								maxWidth={Math.min(220, Math.max(width - 36, 160))}
							/>
						)}
					/>
					{hasArrivals && (
						<Bar
							dataKey="arrived"
							// Its own stack, so it sits left of the checks like the totals read.
							stackId="arrived"
							fill={QC_COLORS.arrived}
							isAnimationActive={false}
						/>
					)}
					<Bar
						dataKey="passes"
						stackId="checked"
						fill={QC_COLORS.passes}
						isAnimationActive={false}
					/>
					<Bar
						dataKey="qc_rejects"
						stackId="checked"
						fill={QC_COLORS.qcRejects}
						isAnimationActive={false}
					/>
				</ComposedChart>
			</ChartContainer>
		</div>
	);
};
