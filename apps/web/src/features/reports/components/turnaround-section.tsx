import { Clock01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Section } from "@/components/section";
import type { TurnaroundReport } from "@/features/reports/api";
import { TurnaroundBreakdown } from "@/features/reports/components/turnaround-breakdown";
import { TurnaroundDotChart } from "@/features/reports/components/turnaround-dot-chart";
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

export const TurnaroundSection = ({ report }: TurnaroundSectionProps) => {
	const [picked, setPicked] = useState<string | null>(null);
	const all = report.rows[0];
	// A filter change can drop the picked Category; All Items takes over.
	const row = rowOrAll(report.rows, picked);
	const rowName = row?.name;
	const dots = useMemo(() => {
		const indexed = report.items.map((item, index) => ({ item, index }));
		return rowName === report.rows[0]?.name
			? indexed
			: indexed.filter(({ item }) => item.categories.includes(rowName));
	}, [report.items, report.rows, rowName]);
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
		<Section count={`${all.items} Items ready`} title="Turnaround">
			<p className="-mt-1 text-subhead text-muted-foreground">
				Drop-off to ready for pickup.
				{all.p90 === null
					? ""
					: ` p90 ${longDuration(all.p90)} means 9 in 10 Items were ready within ${longDuration(all.p90)}.`}
			</p>
			<div className="min-w-0 overflow-hidden rounded-lg border bg-card">
				<div className="min-w-0 px-3 pt-3 pb-1">
					<p className="mb-1 font-medium">{row.name}</p>
					<TurnaroundDotChart dots={dots} row={row} />
				</div>
				<TurnaroundBreakdown
					breakdown={row.breakdown}
					minItems={report.min_items}
				/>
				<table className="w-full border-collapse text-subhead tabular-nums">
					<thead>
						<tr className="border-t text-muted-foreground">
							<th
								className="px-2 py-2 text-left font-medium sm:px-3"
								scope="col"
							>
								Category
							</th>
							<th
								className="px-2 py-2 text-right font-medium sm:px-3"
								scope="col"
							>
								Items
							</th>
							{PERCENTILE_KEYS.map(([key, color]) => (
								<th
									className="px-2 py-2 text-right font-medium sm:px-3"
									key={key}
									scope="col"
								>
									<span
										className="mr-1 inline-block h-0.5 w-2.5 align-middle"
										style={{ backgroundColor: color }}
									/>
									{key}
								</th>
							))}
						</tr>
					</thead>
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
											r === all && "font-semibold",
										)}
										onClick={() => setPicked(r.name)}
										type="button"
									>
										{r.name}
									</button>
								</td>
								<td className="px-2 py-2 text-right sm:px-3">{r.items}</td>
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
									PERCENTILE_KEYS.map(([key]) => (
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
