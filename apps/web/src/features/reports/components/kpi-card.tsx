import {
	ArrowDownIcon,
	ArrowUpIcon,
	InfoIcon,
	MinusIcon,
} from "@phosphor-icons/react";
import { createContext, type ReactNode, useContext } from "react";
import { TextSkeleton } from "@/components/text-skeleton";
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
	// A small dot in a chart's colour, so the card is that chart's key.
	swatch?: string;
	className?: string;
}

const KpiPendingContext = createContext(false);

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
						"w-1.5 rounded-full",
						index === values.length - 1 ? "bg-primary" : "bg-soft-bar-track",
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

interface DeltaLineProps {
	change: number | null;
	deltaAs?: DeltaAs;
	isLowerBetter?: boolean;
	comparisonLabel?: string;
}

export const DeltaLine = ({
	change,
	deltaAs = "percent",
	isLowerBetter = false,
	comparisonLabel,
}: DeltaLineProps) => {
	const rounded = change === null ? null : Math.round(change * 10) / 10 || 0;
	const { tone, Icon } = toneForChange(rounded, isLowerBetter);
	const text = formatKpiDeltaChange(rounded, deltaAs);
	const line = comparisonLabel ? `${text} ${comparisonLabel}` : text;
	return (
		<p className={cn("flex items-start gap-1 text-subhead tabular-nums", tone)}>
			{rounded === null ? null : (
				<Icon className="mt-0.5 size-3.5 shrink-0" weight="bold" />
			)}
			{line}
		</p>
	);
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
	swatch,
	className,
}: KpiCardProps) => {
	const isPending = useContext(KpiPendingContext);
	const shownValue = isPending ? <TextSkeleton className="w-24" /> : value;
	return (
		<Card className={cn("border-border/70 py-0", className)}>
			<CardContent className="grid min-w-0 gap-1 p-3 sm:p-4">
				<p className="flex items-center gap-1 text-subhead font-medium text-muted-foreground">
					{swatch !== undefined && (
						<span
							aria-hidden="true"
							className="mr-0.5 size-2 shrink-0 rounded-full"
							style={{ backgroundColor: swatch }}
						/>
					)}
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
				{/* As tall as the larger value size, so a long Rupiah stepping down
				    a size or a card still loading keeps the row's height. */}
				<div className="flex min-h-7 flex-wrap items-end justify-between gap-x-3 gap-y-1 sm:min-h-8">
					{/* A month of Rupiah ("Rp 240.909.849") steps down a size rather
					    than breaking mid-number onto a second line. */}
					<p
						className={cn(
							"whitespace-nowrap font-semibold tabular-nums",
							typeof value === "string" && value.length > 11
								? "text-headline sm:text-title-2"
								: "text-title-3 sm:text-title-1",
							// After the size, which would otherwise reset it.
							"leading-7 sm:leading-8",
						)}
					>
						{shownValue}
					</p>
					{spark && spark.length > 1 ? <SparkBars values={spark} /> : null}
				</div>
				{/* null is a comparison with nothing to compare yet (still loading,
				    or a quiet last period): the line stays, blank, so the cards
				    don't shrink and grow back. */}
				{delta ? (
					<DeltaLine
						change={kpiDeltaChange(delta, deltaAs)}
						comparisonLabel={comparisonLabel}
						deltaAs={deltaAs}
						isLowerBetter={isLowerBetter}
					/>
				) : null}
				{delta === null ? (
					<p aria-hidden className="invisible text-subhead">
						{" "}
					</p>
				) : null}
				{helper ? (
					<p className="text-muted-foreground text-footnote">{helper}</p>
				) : null}
			</CardContent>
		</Card>
	);
};

interface KpiRowProps {
	children: ReactNode;
	// The report is still loading: each card keeps its label and draws a bar
	// where its number will be.
	isPending?: boolean;
}

export const KpiRow = ({ children, isPending = false }: KpiRowProps) => (
	<KpiPendingContext.Provider value={isPending}>
		{/* Two across on a phone, so all four of today's numbers fit above the chart. */}
		<div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
			{children}
		</div>
	</KpiPendingContext.Provider>
);
