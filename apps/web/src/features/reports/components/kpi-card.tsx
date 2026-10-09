import {
	ArrowDownIcon,
	ArrowUpIcon,
	InfoIcon,
	MinusIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { KpiDelta } from "@/features/reports/api";
import {
	type DeltaAs,
	formatKpiDeltaChange,
	kpiDeltaChange,
} from "@/features/reports/utils/kpi-delta";
import { cn } from "@/lib/utils";

interface KpiCardProps {
	label: string;
	value: ReactNode;
	helper?: ReactNode;
	info?: ReactNode;
	delta?: KpiDelta | null;
	deltaAs?: DeltaAs;
	comparisonLabel?: string;
	isLowerBetter?: boolean;
	// The last few days, oldest first; the last bar is the day on the card.
	spark?: number[];
	className?: string;
}

interface SparkBarsProps {
	values: number[];
}

const SparkBars = ({ values }: SparkBarsProps) => {
	const max = Math.max(...values, 1);
	return (
		<span aria-hidden="true" className="flex h-7 shrink-0 items-end gap-0.5">
			{values.map((value, index) => (
				<span
					key={index}
					className={cn(
						"w-1.5",
						index === values.length - 1 ? "bg-foreground" : "bg-border",
					)}
					style={{ height: `${Math.max((value / max) * 100, 6)}%` }}
				/>
			))}
		</span>
	);
};

const TONE_BY_SIGN = {
	"-1": {
		tone: "text-destructive",
		Icon: ArrowDownIcon,
	},
	"0": {
		tone: "text-muted-foreground",
		Icon: MinusIcon,
	},
	"1": {
		tone: "text-success",
		Icon: ArrowUpIcon,
	},
} as const;

const toneForChange = (change: number | null, isLowerBetter: boolean) => {
	if (change === null) {
		return TONE_BY_SIGN["0"];
	}
	const base = TONE_BY_SIGN[Math.sign(change).toString() as "-1" | "0" | "1"];
	// More QC rejects or Complaints than last period is bad news, so it reads red.
	if (isLowerBetter && change !== 0) {
		return { ...base, tone: change > 0 ? "text-destructive" : "text-success" };
	}
	return base;
};

export const KpiCard = ({
	label,
	value,
	helper,
	info,
	delta,
	deltaAs = "percent",
	comparisonLabel = "vs previous",
	isLowerBetter = false,
	spark,
	className,
}: KpiCardProps) => {
	const change = delta ? kpiDeltaChange(delta, deltaAs) : null;
	const { tone, Icon } = toneForChange(change, isLowerBetter);
	return (
		<Card className={cn("border-border/70 py-0", className)}>
			<CardContent className="grid min-w-0 gap-1 p-3 sm:p-4">
				<p className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
					{label}
					{info ? (
						// A popover, not a tooltip: the owner checks a customer on a phone
						// at the counter, and a hover-only tooltip never opens on a tap.
						<Popover>
							<PopoverTrigger
								aria-label={`How ${label} is calculated`}
								className="text-muted-foreground transition-colors hover:text-foreground"
								openOnHover
								delay={100}
							>
								<InfoIcon className="size-3.5" />
							</PopoverTrigger>
							<PopoverContent align="start" className="w-64">
								{info}
							</PopoverContent>
						</Popover>
					) : null}
				</p>
				<div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
					<p className="break-all text-lg font-semibold tabular-nums sm:text-2xl">
						{value}
					</p>
					{spark && spark.length > 1 ? <SparkBars values={spark} /> : null}
				</div>
				{delta ? (
					<p
						className={cn(
							"flex items-start gap-1 text-[11px] tabular-nums",
							tone,
						)}
					>
						<Icon className="mt-0.5 size-3 shrink-0" weight="bold" />
						{`${formatKpiDeltaChange(change, deltaAs)} ${comparisonLabel}`}
					</p>
				) : null}
				{helper ? (
					<p className="text-muted-foreground text-xs">{helper}</p>
				) : null}
			</CardContent>
		</Card>
	);
};

interface KpiRowProps {
	children: ReactNode;
}

export const KpiRow = ({ children }: KpiRowProps) => (
	// Two across on a phone, so all four of today's numbers fit above the chart.
	<div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
		{children}
	</div>
);
