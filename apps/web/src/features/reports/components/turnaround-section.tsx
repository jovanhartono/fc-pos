import { Clock01Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import { TextSkeleton } from "@/components/text-skeleton";
import { categoriesQueries } from "@/features/categories/api";
import type { TurnaroundReport } from "@/features/reports/api";
import { ChartHeader } from "@/features/reports/components/report-chart";
import { TurnaroundBreakdown } from "@/features/reports/components/turnaround-breakdown";
import { TurnaroundDotChart } from "@/features/reports/components/turnaround-dot-chart";
import { numberFormatter, pluralCount } from "@/features/reports/utils/format";
import { PERCENTILE_KEYS } from "@/features/reports/utils/palette";
import {
	longDuration,
	rowOrAll,
	shortDuration,
} from "@/features/reports/utils/turnaround";
import { cn } from "@/lib/utils";

interface TurnaroundSectionProps {
	report: TurnaroundReport;
}

const TableHead = () => (
	<thead>
		<tr className="border-t text-muted-foreground">
			<th className="px-2 py-2 text-left font-medium sm:px-3" scope="col">
				Category
			</th>
			<th className="px-2 py-2 text-right font-medium sm:px-3" scope="col">
				Items
			</th>
			{PERCENTILE_KEYS.map((key) => (
				<th
					className="px-2 py-2 text-right font-medium sm:px-3"
					key={key}
					scope="col"
				>
					{key}
				</th>
			))}
		</tr>
	</thead>
);

// Drawn at Turnaround's usual size while it loads, so the Dropoff vs Pickup
// chart the owner is reading doesn't drop when it lands. The table has All
// Items plus a row per Category that saw work, so active Categories is the
// closest guess before the report arrives.
export const TurnaroundSectionPlaceholder = () => {
	const categoriesQuery = useQuery(categoriesQueries.list());
	const activeCount = (categoriesQuery.data ?? []).filter(
		(category) => category.is_active,
	).length;
	const rowCount = 1 + (activeCount || 3);

	return (
		<Section count={<TextSkeleton className="w-28" />} title="Turnaround">
			<div
				aria-hidden
				className="min-w-0 overflow-hidden rounded-lg border bg-card"
			>
				<div className="grid min-w-0 gap-3 px-4 pt-4 pb-1">
					<div className="grid">
						<span className="text-footnote">
							<TextSkeleton className="w-40" />
						</span>
						<span className="text-title-1">
							<TextSkeleton className="w-36" />
						</span>
						<span className="text-footnote">
							<TextSkeleton className="w-48" />
						</span>
					</div>
					{/* The dot chart's height at each width. */}
					<div className="@container min-w-0">
						<div className="h-[186px] @min-[30rem]:h-[226px]" />
					</div>
				</div>
				<div className="grid gap-1.5 border-t px-3 pt-2.5 pb-3">
					<p className="text-subhead font-medium">Turnaround breakdown</p>
					<div className="h-2.5 bg-muted" />
					<span className="text-subhead">
						<TextSkeleton className="w-full max-w-80" />
					</span>
				</div>
				<table className="w-full border-collapse text-subhead tabular-nums">
					<TableHead />
					<tbody>
						{Array.from({ length: rowCount }, (_, index) => (
							<tr className="border-t" key={index}>
								<td className="px-2 py-2 sm:px-3">
									<TextSkeleton className="w-20" />
								</td>
								<td className="px-2 py-2 text-right sm:px-3" colSpan={4}>
									<TextSkeleton className="w-32" />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Section>
	);
};

export const TurnaroundSection = ({ report }: TurnaroundSectionProps) => {
	const [picked, setPicked] = useState<string | null>(null);
	const all = report.rows[0];
	// A filter change can drop the picked Category; All Items takes over.
	const row = rowOrAll(report.rows, picked);
	const rowName = row?.name;
	const indexed = report.items.map((item, index) => ({ item, index }));
	const dots =
		rowName === report.rows[0]?.name
			? indexed
			: indexed.filter(({ item }) => item.categories.includes(rowName));
	if (!all || all.items === 0) {
		return (
			<Section title="Turnaround">
				<EmptyState icon={Clock01Icon}>
					No Items ready in this range.
				</EmptyState>
			</Section>
		);
	}

	return (
		<Section
			count={`${pluralCount(all.items, "Item")} ready`}
			title="Turnaround"
		>
			<div className="min-w-0 overflow-hidden rounded-lg border bg-card">
				<div className="grid min-w-0 gap-3 px-4 pt-4 pb-1">
					<ChartHeader
						head={
							row.p75 === null
								? {
										label: `${row.name} · drop-off to ready`,
										value: "—",
										caption: `Needs ${report.min_items} Items to show how fast`,
									}
								: {
										label: `${row.name} · drop-off to ready`,
										value: longDuration(row.p75),
										unit: "for 3 in 4 Items",
										caption: [
											row.p90 === null
												? null
												: `9 in 10 within ${longDuration(row.p90)}`,
											pluralCount(row.items, "Item"),
										]
											.filter(Boolean)
											.join(" · "),
									}
						}
					/>
					<TurnaroundDotChart dots={dots} row={row} />
				</div>
				<TurnaroundBreakdown
					breakdown={row.breakdown}
					minItems={report.min_items}
				/>
				<table className="w-full border-collapse text-subhead tabular-nums">
					<TableHead />
					<tbody>
						{report.rows.map((r) => (
							<tr
								className={cn(
									// iPhone Safari ignores `relative` on a row, so each row's tap
									// area covered the whole screen and the page stopped scrolling.
									"border-t [transform:translateZ(0)] hover:bg-muted",
									r.name === row.name && "bg-info/10 hover:bg-info/10",
								)}
								key={r.name}
							>
								<td className="px-2 py-2 text-left sm:px-3">
									<button
										aria-pressed={r.name === row.name}
										className={cn(
											"text-left after:absolute after:inset-0",
											r === all && "font-medium",
										)}
										onClick={() => setPicked(r.name)}
										type="button"
									>
										{r.name}
									</button>
								</td>
								<td className="px-2 py-2 text-right sm:px-3">
									{numberFormatter.format(r.items)}
								</td>
								{r.p75 === null ? (
									<td
										className="px-2 py-2 text-right text-muted-foreground sm:px-3"
										colSpan={3}
									>
										<span
											className="relative z-10 cursor-help border-b border-dotted"
											title={`Needs ${report.min_items} Items in the range to show p75 / p90 / p99`}
										>
											Not enough data
										</span>
									</td>
								) : (
									PERCENTILE_KEYS.map((key) => (
										<td
											className="px-2 py-2 text-right whitespace-nowrap sm:px-3"
											key={key}
										>
											{shortDuration(r[key] ?? 0)}
										</td>
									))
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Section>
	);
};
