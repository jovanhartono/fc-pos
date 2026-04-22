import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { KpiDelta } from "@/lib/api";
import { cn } from "@/lib/utils";

interface KpiCardProps {
	label: string;
	value: ReactNode;
	helper?: ReactNode;
	delta?: Pick<KpiDelta, "delta_pct"> | null;
	comparisonLabel?: string;
	className?: string;
}

const TONE_BY_SIGN = {
	"-1": {
		sign: "",
		tone: "text-destructive",
		Icon: ArrowDownIcon,
	},
	"0": {
		sign: "±",
		tone: "text-muted-foreground",
		Icon: MinusIcon,
	},
	"1": {
		sign: "+",
		tone: "text-success",
		Icon: ArrowUpIcon,
	},
} as const;

const toneForPct = (pct: number | null | undefined) => {
	if (pct === null || pct === undefined) {
		return {
			sign: "",
			tone: "text-muted-foreground",
			Icon: MinusIcon,
		} as const;
	}
	return TONE_BY_SIGN[Math.sign(pct).toString() as "-1" | "0" | "1"];
};

const formatDeltaPct = (pct: number | null, sign: string): string => {
	if (pct === null) {
		return "—";
	}
	return `${sign}${(pct * 100).toFixed(1)}%`;
};

export const KpiCard = ({
	label,
	value,
	helper,
	delta,
	comparisonLabel = "vs previous",
	className,
}: KpiCardProps) => {
	const pct = delta?.delta_pct;
	const hasDelta = delta !== undefined && delta !== null;
	const { sign, tone, Icon } = toneForPct(pct);
	return (
		<Card className={cn("border-border/70", className)}>
			<CardContent className="grid gap-1 p-4">
				<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					{label}
				</p>
				<p className="break-all font-mono text-xl font-semibold tabular-nums sm:text-2xl">
					{value}
				</p>
				{hasDelta ? (
					<p
						className={cn(
							"flex items-center gap-1 font-mono text-[11px] tabular-nums",
							tone,
						)}
					>
						<Icon className="size-3" weight="bold" />
						{`${formatDeltaPct(pct ?? null, sign)} ${comparisonLabel}`}
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
	<div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{children}
	</div>
);
