import { Analytics01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useId, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import type { ReportGranularity } from "@/features/reports/api";
import {
	bucketToLabel,
	bucketToTooltipLabel,
} from "@/features/reports/utils/granularity";
import { useElementWidth } from "@/hooks/useElementWidth";
import dayjs from "@/lib/dayjs";

export interface ChartSeries {
	key: string;
	name: string;
	color: string;
	values: number[];
}

export interface ChartHead {
	label: string;
	value: string;
	unit?: string;
	caption: string;
	parts?: { key: string; name: string; color?: string; value: string }[];
}

export interface ChartAxis {
	// Daily labels are dates; only Mondays get a label.
	isDaily: boolean;
	tick: (label: string) => string;
	title: (label: string) => string;
}

const DAY_AXIS: ChartAxis = {
	isDaily: true,
	tick: (label) => dayjs(label).format("D MMM"),
	title: (label) => dayjs(label).format("ddd D MMM"),
};

// Workers and QC buckets: a date, or the Monday a week starts.
export const dateAxis = (bucket: "day" | "week"): ChartAxis =>
	bucket === "day"
		? DAY_AXIS
		: {
				isDaily: false,
				tick: (label) => dayjs(label).format("D MMM"),
				title: (label) => `Week of ${dayjs(label).format("D MMM")}`,
			};

export const rangeAxis = (granularity: ReportGranularity): ChartAxis =>
	granularity === "day"
		? DAY_AXIS
		: {
				isDaily: false,
				tick: (label) => bucketToLabel(label, granularity),
				title: (label) => bucketToTooltipLabel(label, granularity),
			};

interface ReportChartProps {
	labels: string[];
	axis: ChartAxis;
	// Bars side by side in each bucket; each one is a stack, bottom first.
	groups: ChartSeries[][];
	kind?: "bar" | "line";
	average?: { name: string; values: (number | null)[] };
	formatAxis: (value: number) => string;
	// The picked bucket's numbers, or the whole range's when none is picked.
	head: (index: number | null) => ChartHead;
}

// One series' value in the picked bucket, or its total for the range.
export const valueAt = (series: ChartSeries, index: number | null) =>
	index === null
		? series.values.reduce((sum, value) => sum + value, 0)
		: series.values[index];

export const headParts = (
	series: ChartSeries[],
	index: number | null,
	format: (value: number) => string,
) =>
	series.map((s) => ({
		key: s.key,
		name: s.name,
		color: s.color,
		value: format(valueAt(s, index)),
	}));

interface SumHeadArgs {
	name: string;
	caption: string;
	labels: string[];
	axis: ChartAxis;
	series: ChartSeries[];
	format: (value: number) => string;
}

// The usual header: every series added up, each one listed when there's more.
export const sumHead =
	({ name, caption, labels, axis, series, format }: SumHeadArgs) =>
	(index: number | null): ChartHead => ({
		label: index === null ? name : axis.title(labels[index]),
		value: format(series.reduce((sum, s) => sum + valueAt(s, index), 0)),
		caption: index === null ? caption : name,
		parts: series.length > 1 ? headParts(series, index, format) : undefined,
	});

const RIGHT = 40;
const BOTTOM = 20;
const TOP = 6;
// The header's three lines and the gap under them.
const HEADER = 80;
const MIN_TICK_GAP = 44;
const GRID = "var(--border)";
const LABEL = "var(--muted-foreground)";
const AVERAGE = "var(--chart-average)";

const niceStep = (max: number, lines: number) => {
	const raw = max / lines;
	const power = 10 ** Math.floor(Math.log10(raw));
	return (
		[1, 2, 5, 10].map((m) => m * power).find((step) => step >= raw) ?? power
	);
};

const roundedTop = (x: number, y: number, w: number, h: number, r: number) => {
	const radius = Math.min(r, w / 2, h);
	return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
};

// Fritsch–Carlson: smooth, and never dips below a zero day.
const monotonePath = (points: [number, number][]) => {
	const n = points.length;
	if (n < 2) {
		return "";
	}
	const dx: number[] = [];
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		dx.push(points[i + 1][0] - points[i][0]);
		slope.push((points[i + 1][1] - points[i][1]) / dx[i]);
	}
	const t = points.map((_, i) => {
		if (i === 0) {
			return slope[0];
		}
		if (i === n - 1) {
			return slope[n - 2];
		}
		if (slope[i - 1] * slope[i] <= 0) {
			return 0;
		}
		return (
			(3 * (dx[i - 1] + dx[i])) /
			((2 * dx[i] + dx[i - 1]) / slope[i - 1] +
				(dx[i] + 2 * dx[i - 1]) / slope[i])
		);
	});
	let d = `M${points[0][0]},${points[0][1]}`;
	for (let i = 0; i < n - 1; i++) {
		const h = dx[i] / 3;
		d += `C${points[i][0] + h},${points[i][1] + h * t[i]} ${points[i + 1][0] - h},${points[i + 1][1] - h * t[i + 1]} ${points[i + 1][0]},${points[i + 1][1]}`;
	}
	return d;
};

// Mondays on a daily chart, every bucket otherwise; every other one dropped
// until no two labels touch on a phone.
export const axisTicks = (
	labels: string[],
	isDaily: boolean,
	slotWidth: number,
) => {
	const all = labels.map((label, i) => ({ label, i }));
	const mondays = all.filter(({ label }) => dayjs(label).day() === 1);
	// A few days with no Monday in them still get their first day named.
	let ticks = isDaily ? (mondays.length > 0 ? mondays : all.slice(0, 1)) : all;
	while (
		ticks.length > 1 &&
		(ticks[1].i - ticks[0].i) * slotWidth < MIN_TICK_GAP
	) {
		ticks = ticks.filter((_, k) => k % 2 === 0);
	}
	return ticks;
};

const sumAt = (stack: ChartSeries[], index: number) =>
	stack.reduce((sum, series) => sum + series.values[index], 0);

interface ChartHeaderProps {
	head: ChartHead;
}

export const ChartHeader = ({ head }: ChartHeaderProps) => (
	<div className="flex flex-wrap items-start gap-x-6 gap-y-1">
		<div className="grid">
			<span className="text-footnote text-muted-foreground">{head.label}</span>
			<span className="font-medium text-title-1 tabular-nums">
				{head.value}
				{head.unit === undefined ? null : (
					<span className="ml-1 font-normal text-headline text-muted-foreground">
						{head.unit}
					</span>
				)}
			</span>
			<span className="text-footnote text-muted-foreground">
				{head.caption}
			</span>
		</div>
		{head.parts === undefined ? null : (
			<ul className="flex basis-full flex-wrap gap-x-3.5 gap-y-0.5 text-subhead tabular-nums @xl:mt-0.5 @xl:flex-1 @xl:basis-0 @xl:justify-end">
				{head.parts.map((part) => (
					<li key={part.key} className="flex items-center gap-1.5">
						{part.color === undefined ? null : (
							<span
								aria-hidden="true"
								className="size-2 shrink-0 rounded-full"
								style={{ backgroundColor: part.color }}
							/>
						)}
						{part.name}
						<span className="font-medium">{part.value}</span>
					</li>
				))}
			</ul>
		)}
	</div>
);

// Every report chart: the total up top that follows a finger or pointer,
// a dotted grid with the scale on the right, and rounded bar tops.
export const ReportChart = ({
	labels,
	axis,
	groups,
	kind = "bar",
	average,
	formatAxis,
	head,
}: ReportChartProps) => {
	const { ref, width } = useElementWidth();
	const [picked, setPicked] = useState<number | null>(null);
	// A tapped day stays in the header after the finger lifts, so a manager
	// can read it; tapping anywhere else brings the range total back.
	useEffect(() => {
		const clearOutside = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) {
				setPicked(null);
			}
		};
		window.addEventListener("pointerdown", clearOutside);
		return () => window.removeEventListener("pointerdown", clearOutside);
	}, [ref]);
	const gradientId = useId();
	const n = labels.length;
	const height = width < 480 ? 170 : 200;
	const plotWidth = Math.max(width - RIGHT, 0);
	const plotHeight = height - BOTTOM - TOP;
	const shown = picked !== null && picked < n ? picked : null;

	const values = groups.flat().flatMap((series) => series.values);
	const isEmpty = values.every((value) => value === 0);
	const tops = labels.map((_, i) =>
		Math.max(
			...groups.map((stack) => sumAt(stack, i)),
			average?.values[i] ?? 0,
		),
	);
	const peak = Math.max(...tops, 1);
	// Revenue dips below zero on a day refunds outrun payments.
	const low = Math.min(...values, 0);
	const step = Math.max(niceStep(peak - low, width < 480 ? 3 : 4), 1);
	const yMax = Math.ceil(peak / step) * step;
	const yMin = Math.floor(low / step) * step;
	const y = (value: number) =>
		TOP + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;
	const band = n > 0 ? plotWidth / n : 0;
	const xMid = (i: number) => i * band + band / 2;
	const gridValues = Array.from(
		{ length: Math.round((yMax - yMin) / step) + 1 },
		(_, k) => yMin + k * step,
	);

	const ticks = axisTicks(labels, axis.isDaily, band);

	const barWidth = Math.max(
		2,
		Math.min(width < 480 ? 7 : 14, (band * 0.66) / groups.length),
	);
	const barGap = groups.length > 1 ? Math.max(1, barWidth * 0.18) : 0;
	const radius = barWidth > 6 ? 3 : 1.5;
	const groupWidth = groups.length * barWidth + (groups.length - 1) * barGap;

	const pick = (event: React.PointerEvent<SVGRectElement>) => {
		const box = event.currentTarget.getBoundingClientRect();
		const index = Math.floor(((event.clientX - box.left) / box.width) * n);
		setPicked(Math.min(Math.max(index, 0), n - 1));
	};

	const bars = () =>
		labels.flatMap((_, i) => {
			const opacity = shown === null || shown === i ? 1 : 0.35;
			const left = xMid(i) - groupWidth / 2;
			return groups.flatMap((stack, g) => {
				const x = left + g * (barWidth + barGap);
				const top = stack.reduce(
					(last, series, s) => (series.values[i] > 0 ? s : last),
					-1,
				);
				let base = 0;
				return stack.flatMap((series, s) => {
					const value = series.values[i];
					if (value <= 0) {
						return [];
					}
					const y1 = y(base + value);
					const h = y(base) - y1;
					base += value;
					const key = `${i}-${series.key}`;
					// A 1px gap under every part but the top one keeps stacked
					// colours apart without a stroke eating into the bar.
					return s === top ? (
						<path
							key={key}
							d={roundedTop(x, y1, barWidth, h, radius)}
							fill={series.color}
							opacity={opacity}
						/>
					) : (
						<rect
							key={key}
							x={x}
							y={y1 + 1}
							width={barWidth}
							height={Math.max(h - 1, 0.5)}
							fill={series.color}
							opacity={opacity}
						/>
					);
				});
			});
		});

	const lines = () => {
		const [series] = groups[0];
		// One day in range: a dot, since a line needs two.
		if (n === 1) {
			return (
				<circle
					cx={xMid(0)}
					cy={y(series.values[0])}
					r={4}
					fill={series.color}
				/>
			);
		}
		const path = monotonePath(series.values.map((v, i) => [xMid(i), y(v)]));
		return (
			<>
				<defs>
					<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
						<stop offset="0" stopColor={series.color} stopOpacity={0.22} />
						<stop offset="1" stopColor={series.color} stopOpacity={0} />
					</linearGradient>
				</defs>
				<path
					d={`${path}L${xMid(n - 1)},${TOP + plotHeight}L${xMid(0)},${TOP + plotHeight}Z`}
					fill={`url(#${gradientId})`}
				/>
				<path
					d={path}
					fill="none"
					stroke={series.color}
					strokeWidth={2}
					strokeLinejoin="round"
					strokeLinecap="round"
				/>
				{shown !== null && (
					<>
						<line
							x1={xMid(shown)}
							x2={xMid(shown)}
							y1={TOP}
							y2={TOP + plotHeight}
							stroke={LABEL}
						/>
						<circle
							cx={xMid(shown)}
							cy={y(series.values[shown])}
							r={4}
							fill={series.color}
							stroke="var(--card)"
							strokeWidth={2}
						/>
					</>
				)}
			</>
		);
	};

	const averageLine = () => {
		if (!average) {
			return null;
		}
		// A day without an average breaks the line instead of bridging it.
		const runs: [number, number][][] = [[]];
		for (const [i, value] of average.values.entries()) {
			if (value === null) {
				runs.push([]);
			} else {
				runs[runs.length - 1].push([xMid(i), y(value)]);
			}
		}
		const last = average.values.reduce<number>(
			(found, value, i) => (value === null ? found : i),
			-1,
		);
		return (
			<>
				{runs
					.filter((run) => run.length > 0)
					.map((run) => (
						<path
							key={`${run[0][0]}`}
							d={
								run.length === 1
									? `M${run[0][0] - 3},${run[0][1]}H${run[0][0] + 3}`
									: monotonePath(run)
							}
							fill="none"
							stroke={AVERAGE}
							strokeWidth={1.5}
						/>
					))}
				{last !== -1 && (
					<text
						x={xMid(last)}
						y={y(average.values[last] ?? 0) - 6}
						textAnchor="end"
						fontSize={11}
						fontWeight={500}
						fill={AVERAGE}
						stroke="var(--card)"
						strokeWidth={4}
						paintOrder="stroke"
					>
						{average.name}
					</text>
				)}
			</>
		);
	};

	// Loading or a quiet range: a header of zeros would read as a real result.
	if (isEmpty) {
		return (
			<div ref={ref} className="grid" style={{ height: height + HEADER }}>
				<EmptyState icon={Analytics01Icon}>No data in range.</EmptyState>
			</div>
		);
	}

	return (
		<div ref={ref} className="@container grid gap-3">
			<ChartHeader head={head(shown)} />
			<div className="min-w-0" style={{ height }}>
				{width > 0 && (
					<svg
						aria-hidden="true"
						className="block touch-pan-y overflow-visible select-none"
						width={width}
						height={height}
					>
						{gridValues.map((value) => (
							<g key={value}>
								<line
									x1={0}
									x2={plotWidth}
									y1={y(value)}
									y2={y(value)}
									stroke={GRID}
									strokeDasharray={value === 0 ? undefined : "2 3"}
								/>
								<text
									x={plotWidth + 6}
									y={y(value) + 4}
									fontSize={11}
									fill={LABEL}
								>
									{formatAxis(value)}
								</text>
							</g>
						))}
						{ticks.map(({ label, i }) => (
							<g key={label}>
								<line
									x1={xMid(i)}
									x2={xMid(i)}
									y1={TOP}
									y2={TOP + plotHeight}
									stroke={GRID}
									strokeDasharray="2 3"
								/>
								<text
									x={xMid(i)}
									y={height - 4}
									textAnchor="middle"
									fontSize={11}
									fill={LABEL}
								>
									{axis.tick(label)}
								</text>
							</g>
						))}
						{kind === "line" ? lines() : bars()}
						{averageLine()}
						<rect
							x={0}
							y={0}
							width={plotWidth}
							height={height}
							fill="transparent"
							onPointerDown={pick}
							onPointerMove={pick}
							onPointerLeave={(event) => {
								if (event.pointerType === "mouse") {
									setPicked(null);
								}
							}}
						/>
					</svg>
				)}
			</div>
		</div>
	);
};
