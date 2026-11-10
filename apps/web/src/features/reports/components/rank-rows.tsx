import { Fragment } from "react";
import {
	compactMoney,
	percentFormatter,
} from "@/features/reports/utils/format";

export interface RankRow {
	key: string | number;
	code?: string;
	name: string;
	value: number;
	notes: string[];
}

interface RankRowsProps {
	rows: RankRow[];
}

export const shareNote = (value: number, total: number) =>
	`${percentFormatter.format(total > 0 ? value / total : 0)} share`;

// Stores, Categories and Services rank the same way on the Financial tab, so
// an owner reads each "who earns the most" list without relearning it.
export const RankRows = ({ rows }: RankRowsProps) => {
	const max = rows.reduce((m, row) => Math.max(m, row.value), 0);
	return (
		<div className="grid grid-cols-1 gap-3">
			{rows.map((row) => (
				<div className="grid gap-1" key={row.key}>
					<div className="flex items-baseline justify-between gap-2">
						<span className="flex min-w-0 items-baseline gap-2 text-body font-medium">
							{row.code !== undefined && (
								<span className="font-normal text-subhead tabular-nums">
									{row.code}
								</span>
							)}
							<span>{row.name}</span>
						</span>
						<span className="shrink-0 text-body tabular-nums">
							{compactMoney(row.value)}
						</span>
					</div>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-bar-track">
						<div
							className="h-full rounded-full bg-primary"
							// A day of refunds on older Orders leaves a Store below zero: no bar.
							style={{
								width: `${max > 0 ? (Math.max(row.value, 0) / max) * 100 : 0}%`,
							}}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-x-3 text-subhead tabular-nums">
						{row.notes.map((note, index) => (
							<Fragment key={note}>
								{index > 0 && (
									<span aria-hidden className="text-muted-foreground">
										·
									</span>
								)}
								<span>{note}</span>
							</Fragment>
						))}
					</div>
				</div>
			))}
		</div>
	);
};
