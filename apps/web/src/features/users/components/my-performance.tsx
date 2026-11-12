import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { SectionTitle } from "@/components/section";
import { TextSkeleton } from "@/components/text-skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	ComplaintsChip,
	QcChip,
} from "@/features/reports/components/tone-chip";
import { type PerformancePeriod, usersQueries } from "@/features/users/api";
import {
	comparedPeriodLabel,
	FIGURE_COUNTS,
	type Figure,
	figuresOf,
	type MeasuredRole,
} from "@/features/users/utils/my-performance";
import { cn } from "@/lib/utils";

const PERIODS: { value: PerformancePeriod; label: string }[] = [
	{ value: "last_7_days", label: "Last 7 Days" },
	{ value: "this_month", label: "This Month" },
	{ value: "last_month", label: "Last Month" },
];

const ROLE_NOTES: Record<MeasuredRole, string> = {
	worker: "Services you finished, and the QC checks and Complaints on them.",
	cashier: "Orders you created, Pickups you processed and QC checks you ran.",
	courier: "Orders you collected from Customers.",
};

const FigureValueText = ({ value }: Pick<Figure, "value">) => {
	if (value.kind === "qc") {
		return <QcChip checks={value.checks} rejects={value.rejects} />;
	}
	if (value.kind === "complaints") {
		return (
			<ComplaintsChip complaints={value.complaints} finished={value.finished} />
		);
	}
	return <>{value.text}</>;
};

interface FigureRowProps {
	figure: Figure;
	comparedTo: string;
}

const FigureRow = ({ figure, comparedTo }: FigureRowProps) => (
	<li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5">
		<span className="text-body">{figure.label}</span>
		<span className="text-right font-medium text-headline tabular-nums">
			<FigureValueText value={figure.value} />
		</span>
		{/* A line even when there's nothing to compare, so rows never change height. */}
		<span className="col-start-2 text-right text-footnote text-muted-foreground tabular-nums">
			{figure.change ? (
				<>
					<span
						className={cn(
							figure.change.isBetter === true && "text-tone-good-foreground",
							figure.change.isBetter === false && "text-tone-bad-foreground",
						)}
					>
						{figure.change.text}
					</span>{" "}
					{figure.change.isBetter === null ? "as" : "vs"} {comparedTo}
				</>
			) : (
				" "
			)}
		</span>
	</li>
);

interface PlaceholderRowsProps {
	count: number;
}

const PlaceholderRows = ({ count }: PlaceholderRowsProps) =>
	Array.from({ length: count }, (_, index) => (
		<li
			className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5"
			key={index}
		>
			<TextSkeleton className="w-32 text-body" />
			<TextSkeleton className="w-10 justify-self-end text-headline" />
			<TextSkeleton className="col-start-2 w-24 justify-self-end text-footnote" />
		</li>
	));

interface MyPerformanceProps {
	role: MeasuredRole;
}

export const MyPerformance = ({ role }: MyPerformanceProps) => {
	const [period, setPeriod] = useState<PerformancePeriod>("this_month");
	// The last period's figures stay on screen, dimmed, until the next arrive.
	const query = useQuery({
		...usersQueries.performance(period),
		placeholderData: keepPreviousData,
	});
	const performance =
		query.data && query.data.role !== "admin" ? query.data : null;

	let rows: ReactNode = <PlaceholderRows count={FIGURE_COUNTS[role]} />;
	if (performance) {
		const comparedTo = comparedPeriodLabel(
			performance.previous_window.from,
			performance.previous_window.to,
		);
		rows = figuresOf(performance).map((figure) => (
			<FigureRow comparedTo={comparedTo} figure={figure} key={figure.label} />
		));
	} else if (query.isError) {
		rows = (
			<li className="py-2.5 text-body text-destructive">
				Could not load your figures.
			</li>
		);
	}

	return (
		<section aria-labelledby="my-performance" className="grid gap-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<SectionTitle id="my-performance" title="My Performance" />
				<Tabs
					onValueChange={(value) => setPeriod(value as PerformancePeriod)}
					value={period}
				>
					<TabsList aria-label="Period" className="w-full sm:w-fit">
						{PERIODS.map((item) => (
							<TabsTrigger key={item.value} value={item.value}>
								{item.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>
			<p className="text-muted-foreground text-subhead">{ROLE_NOTES[role]}</p>
			<ul
				aria-busy={query.isFetching}
				className={cn(
					"divide-y rounded-lg border bg-card px-3 transition-opacity",
					query.isPlaceholderData && "opacity-60",
				)}
			>
				{rows}
			</ul>
		</section>
	);
};
