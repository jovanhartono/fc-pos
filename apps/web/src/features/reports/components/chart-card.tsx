import type { ReactNode } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	PolarAngleAxis,
	PolarGrid,
	PolarRadiusAxis,
	Radar,
	RadarChart,
	RadialBar,
	RadialBarChart,
	Scatter,
	ScatterChart,
	XAxis,
	YAxis,
	ZAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	bucketToLabel,
	bucketToTooltipLabel,
} from "@/features/reports/utils/granularity";
import { CHART_PALETTE } from "@/features/reports/utils/palette";
import type { ReportGranularity } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ChartSeries {
	key: string;
	label: string;
	color: string;
}

interface ShellProps {
	title: string;
	description?: string;
	className?: string;
	action?: ReactNode;
	emptyState?: ReactNode;
	height?: number;
}

interface SeriesChartProps extends ShellProps {
	data: Array<Record<string, number | string>>;
	series: ChartSeries[];
	granularity?: ReportGranularity;
	stacked?: boolean;
	valueFormatter?: (value: number) => string;
}

interface AreaProps extends SeriesChartProps {
	variant: "area";
}

interface BarProps extends SeriesChartProps {
	variant: "bar" | "stacked-bar";
}

interface SingleCategory {
	name: string;
	value: number;
	color: string;
}

interface PieDonutProps extends ShellProps {
	variant: "pie" | "donut";
	data: SingleCategory[];
	valueFormatter?: (value: number) => string;
	showLabels?: boolean;
}

interface RadarProps extends ShellProps {
	variant: "radar";
	data: Array<Record<string, number | string>>;
	series: ChartSeries[];
	categoryKey: string;
	valueFormatter?: (value: number) => string;
}

interface RadialProps extends ShellProps {
	variant: "radial";
	data: SingleCategory[];
	valueFormatter?: (value: number) => string;
	maxValue?: number;
}

interface ScatterProps extends ShellProps {
	variant: "scatter";
	data: Array<{
		x: number;
		y: number;
		z?: number;
		name?: string;
		color?: string;
	}>;
	xLabel: string;
	yLabel: string;
	valueFormatter?: (value: number) => string;
}

export type ChartCardProps =
	| AreaProps
	| BarProps
	| PieDonutProps
	| RadarProps
	| RadialProps
	| ScatterProps;

const DEFAULT_COMPACT = new Intl.NumberFormat("en-ID", { notation: "compact" });

const formatDefault = (v: number) => DEFAULT_COMPACT.format(v);

const Shell = ({
	title,
	description,
	className,
	action,
	children,
}: ShellProps & { children: ReactNode }) => (
	<Card className={cn("border-border/70", className)}>
		<CardHeader className="flex flex-row items-start justify-between gap-3">
			<div className="grid gap-1">
				<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					{title}
				</CardTitle>
				{description ? (
					<p className="text-xs text-muted-foreground">{description}</p>
				) : null}
			</div>
			{action}
		</CardHeader>
		<CardContent className="p-4 pt-0">{children}</CardContent>
	</Card>
);

const Empty = ({ children }: { children?: ReactNode }) =>
	children ?? (
		<div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
			No data in range.
		</div>
	);

const seriesConfig = (series: ChartSeries[]): ChartConfig =>
	series.reduce<ChartConfig>((acc, s) => {
		acc[s.key] = { label: s.label, color: s.color };
		return acc;
	}, {});

const singleConfig = (data: SingleCategory[]): ChartConfig =>
	data.reduce<ChartConfig>((acc, row) => {
		acc[row.name] = { label: row.name, color: row.color };
		return acc;
	}, {});

export const ChartCard = (props: ChartCardProps) => {
	switch (props.variant) {
		case "area":
			return <AreaVariant {...props} />;
		case "bar":
		case "stacked-bar":
			return <BarVariant {...props} />;
		case "pie":
		case "donut":
			return <PieVariant {...props} />;
		case "radar":
			return <RadarVariant {...props} />;
		case "radial":
			return <RadialVariant {...props} />;
		case "scatter":
			return <ScatterVariant {...props} />;
		default:
			return null;
	}
};

const AreaVariant = ({
	title,
	description,
	className,
	action,
	emptyState,
	height = 260,
	data,
	series,
	granularity = "day",
	stacked = false,
	valueFormatter = formatDefault,
}: AreaProps) => {
	const config = seriesConfig(series);
	const isEmpty =
		data.length === 0 ||
		data.every((row) =>
			series.every((s) => {
				const value = row[s.key];
				return typeof value !== "number" || value === 0;
			}),
		);
	return (
		<Shell
			title={title}
			description={description}
			className={className}
			action={action}
		>
			{isEmpty ? (
				<Empty>{emptyState}</Empty>
			) : (
				<ChartContainer
					config={config}
					className="aspect-auto w-full"
					style={{ height }}
				>
					<AreaChart data={data} margin={{ left: 12, right: 12, top: 10 }}>
						<defs>
							{series.map((s) => (
								<linearGradient
									id={`fill-${s.key}`}
									key={s.key}
									x1="0"
									y1="0"
									x2="0"
									y2="1"
								>
									<stop offset="5%" stopColor={s.color} stopOpacity={0.7} />
									<stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
								</linearGradient>
							))}
						</defs>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis
							dataKey="bucket"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							minTickGap={24}
							tickFormatter={(value: string) =>
								bucketToLabel(value, granularity)
							}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							width={60}
							tickFormatter={(v: number) => valueFormatter(v)}
						/>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									labelFormatter={(value) =>
										bucketToTooltipLabel(value as string, granularity)
									}
									formatter={(value, name) => (
										<div className="flex flex-1 items-center justify-between gap-3">
											<span className="text-muted-foreground">
												{config[name as string]?.label ?? name}
											</span>
											<span className="font-mono font-medium text-foreground tabular-nums">
												{valueFormatter(Number(value))}
											</span>
										</div>
									)}
								/>
							}
						/>
						{series.map((s) => (
							<Area
								key={s.key}
								dataKey={s.key}
								type="monotone"
								fill={`url(#fill-${s.key})`}
								fillOpacity={0.4}
								stroke={s.color}
								strokeWidth={2}
								stackId={stacked ? "stack" : undefined}
							/>
						))}
						{series.length > 1 ? (
							<ChartLegend content={<ChartLegendContent />} />
						) : null}
					</AreaChart>
				</ChartContainer>
			)}
		</Shell>
	);
};

const BarVariant = ({
	title,
	description,
	className,
	action,
	emptyState,
	height = 260,
	data,
	series,
	granularity = "day",
	variant,
	valueFormatter = formatDefault,
}: BarProps) => {
	const config = seriesConfig(series);
	const stacked = variant === "stacked-bar";
	const isEmpty =
		data.length === 0 ||
		data.every((row) =>
			series.every((s) => {
				const value = row[s.key];
				return typeof value !== "number" || value === 0;
			}),
		);
	return (
		<Shell
			title={title}
			description={description}
			className={className}
			action={action}
		>
			{isEmpty ? (
				<Empty>{emptyState}</Empty>
			) : (
				<ChartContainer
					config={config}
					className="aspect-auto w-full"
					style={{ height }}
				>
					<BarChart data={data} margin={{ left: 12, right: 12, top: 10 }}>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis
							dataKey="bucket"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							minTickGap={24}
							tickFormatter={(value: string) =>
								bucketToLabel(value, granularity)
							}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							width={60}
							tickFormatter={(v: number) => valueFormatter(v)}
						/>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									labelFormatter={(value) =>
										bucketToTooltipLabel(value as string, granularity)
									}
									formatter={(value, name) => (
										<div className="flex flex-1 items-center justify-between gap-3">
											<span className="text-muted-foreground">
												{config[name as string]?.label ?? name}
											</span>
											<span className="font-mono font-medium text-foreground tabular-nums">
												{valueFormatter(Number(value))}
											</span>
										</div>
									)}
								/>
							}
						/>
						{series.map((s) => (
							<Bar
								key={s.key}
								dataKey={s.key}
								fill={s.color}
								stackId={stacked ? "stack" : undefined}
								radius={stacked ? 0 : [2, 2, 0, 0]}
							/>
						))}
						{series.length > 1 ? (
							<ChartLegend content={<ChartLegendContent />} />
						) : null}
					</BarChart>
				</ChartContainer>
			)}
		</Shell>
	);
};

const PieVariant = ({
	title,
	description,
	className,
	action,
	emptyState,
	height = 280,
	data,
	variant,
	valueFormatter = formatDefault,
	showLabels = false,
}: PieDonutProps) => {
	const config = singleConfig(data);
	const total = data.reduce((s, r) => s + r.value, 0);
	const isEmpty = total === 0;
	return (
		<Shell
			title={title}
			description={description}
			className={className}
			action={action}
		>
			{isEmpty ? (
				<Empty>{emptyState}</Empty>
			) : (
				<ChartContainer
					config={config}
					className="aspect-auto w-full"
					style={{ height }}
				>
					<PieChart>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									formatter={(value, name) => (
										<div className="flex flex-1 items-center justify-between gap-3">
											<span className="text-muted-foreground">{name}</span>
											<span className="font-mono font-medium text-foreground tabular-nums">
												{valueFormatter(Number(value))}
											</span>
										</div>
									)}
								/>
							}
						/>
						<Pie
							data={data}
							dataKey="value"
							nameKey="name"
							cx="50%"
							cy="50%"
							outerRadius={100}
							innerRadius={variant === "donut" ? 60 : 0}
							strokeWidth={2}
							label={showLabels}
						>
							{data.map((entry) => (
								<Cell key={entry.name} fill={entry.color} />
							))}
						</Pie>
						<ChartLegend content={<ChartLegendContent />} />
					</PieChart>
				</ChartContainer>
			)}
		</Shell>
	);
};

const RadarVariant = ({
	title,
	description,
	className,
	action,
	emptyState,
	height = 320,
	data,
	series,
	categoryKey,
	valueFormatter = formatDefault,
}: RadarProps) => {
	const config = seriesConfig(series);
	const isEmpty = data.length === 0;
	return (
		<Shell
			title={title}
			description={description}
			className={className}
			action={action}
		>
			{isEmpty ? (
				<Empty>{emptyState}</Empty>
			) : (
				<ChartContainer
					config={config}
					className="aspect-auto w-full"
					style={{ height }}
				>
					<RadarChart data={data}>
						<PolarGrid gridType="polygon" />
						<PolarAngleAxis dataKey={categoryKey} tick={{ fontSize: 11 }} />
						<PolarRadiusAxis tick={{ fontSize: 10 }} />
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									formatter={(value, name) => (
										<div className="flex flex-1 items-center justify-between gap-3">
											<span className="text-muted-foreground">
												{config[name as string]?.label ?? name}
											</span>
											<span className="font-mono font-medium text-foreground tabular-nums">
												{valueFormatter(Number(value))}
											</span>
										</div>
									)}
								/>
							}
						/>
						{series.map((s) => (
							<Radar
								key={s.key}
								dataKey={s.key}
								stroke={s.color}
								fill={s.color}
								fillOpacity={0.25}
								strokeWidth={2}
							/>
						))}
						<ChartLegend content={<ChartLegendContent />} />
					</RadarChart>
				</ChartContainer>
			)}
		</Shell>
	);
};

const RadialVariant = ({
	title,
	description,
	className,
	action,
	emptyState,
	height = 280,
	data,
	valueFormatter = formatDefault,
	maxValue,
}: RadialProps) => {
	const config = singleConfig(data);
	const isEmpty = data.length === 0 || data.every((r) => r.value === 0);
	return (
		<Shell
			title={title}
			description={description}
			className={className}
			action={action}
		>
			{isEmpty ? (
				<Empty>{emptyState}</Empty>
			) : (
				<ChartContainer
					config={config}
					className="aspect-auto w-full"
					style={{ height }}
				>
					<RadialBarChart
						data={data}
						innerRadius={30}
						outerRadius={120}
						startAngle={90}
						endAngle={-270}
					>
						<PolarAngleAxis
							type="number"
							domain={[
								0,
								maxValue ?? data.reduce((m, r) => Math.max(m, r.value), 0),
							]}
							tick={false}
						/>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									formatter={(value, name) => (
										<div className="flex flex-1 items-center justify-between gap-3">
											<span className="text-muted-foreground">{name}</span>
											<span className="font-mono font-medium text-foreground tabular-nums">
												{valueFormatter(Number(value))}
											</span>
										</div>
									)}
								/>
							}
						/>
						<RadialBar
							dataKey="value"
							background={{ fill: "var(--muted)" }}
							cornerRadius={4}
						>
							{data.map((entry) => (
								<Cell key={entry.name} fill={entry.color} />
							))}
						</RadialBar>
						<ChartLegend content={<ChartLegendContent />} />
					</RadialBarChart>
				</ChartContainer>
			)}
		</Shell>
	);
};

const ScatterVariant = ({
	title,
	description,
	className,
	action,
	emptyState,
	height = 320,
	data,
	xLabel,
	yLabel,
	valueFormatter = formatDefault,
}: ScatterProps) => {
	const config: ChartConfig = {
		scatter: { label: title, color: CHART_PALETTE[0] },
	};
	const isEmpty = data.length === 0;
	return (
		<Shell
			title={title}
			description={description}
			className={className}
			action={action}
		>
			{isEmpty ? (
				<Empty>{emptyState}</Empty>
			) : (
				<ChartContainer
					config={config}
					className="aspect-auto w-full"
					style={{ height }}
				>
					<ScatterChart margin={{ left: 12, right: 12, top: 10 }}>
						<CartesianGrid strokeDasharray="3 3" />
						<XAxis
							type="number"
							dataKey="x"
							name={xLabel}
							tickLine={false}
							axisLine={false}
							tickFormatter={(v: number) => valueFormatter(v)}
						/>
						<YAxis
							type="number"
							dataKey="y"
							name={yLabel}
							tickLine={false}
							axisLine={false}
							tickFormatter={(v: number) => valueFormatter(v)}
						/>
						<ZAxis type="number" dataKey="z" range={[60, 400]} />
						<ChartTooltip
							cursor={{ strokeDasharray: "3 3" }}
							content={<ChartTooltipContent />}
						/>
						<Scatter data={data} fill={CHART_PALETTE[0]}>
							{data.map((entry, idx) => (
								<Cell
									key={entry.name ?? idx}
									fill={entry.color ?? CHART_PALETTE[0]}
								/>
							))}
						</Scatter>
					</ScatterChart>
				</ChartContainer>
			)}
		</Shell>
	);
};
