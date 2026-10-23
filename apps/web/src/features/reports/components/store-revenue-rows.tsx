import {
	compactMoney,
	percentFormatter,
	pluralCount,
} from "@/features/reports/utils/format";

interface StoreRevenueRow {
	store_id: number;
	store_code: string;
	store_name: string;
	revenue: number;
	orders: number;
	share: number;
}

interface StoreRevenueRowsProps {
	rows: StoreRevenueRow[];
}

// Overview and Financial show Stores the same way, so an owner comparing the
// day with the month reads one layout.
export const StoreRevenueRows = ({ rows }: StoreRevenueRowsProps) => {
	const max = rows.reduce((m, row) => Math.max(m, row.revenue), 0);
	return (
		<div className="grid grid-cols-1 gap-3">
			{rows.map((row) => {
				// A day of refunds on older Orders leaves a Store below zero: no bar.
				const widthPct = max === 0 ? 0 : (Math.max(row.revenue, 0) / max) * 100;
				const aov = row.orders > 0 ? row.revenue / row.orders : 0;
				return (
					<div className="grid gap-1" key={row.store_id}>
						<div className="flex items-center justify-between gap-2">
							<span className="flex min-w-0 items-center gap-2 truncate text-body font-medium">
								<span className="font-normal text-subhead tabular-nums">
									{row.store_code}
								</span>
								<span className="truncate">{row.store_name}</span>
							</span>
							<span className="text-body tabular-nums">
								{compactMoney(row.revenue)}
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-bar-track">
							<div
								className="h-full rounded-full bg-primary"
								style={{ width: `${widthPct}%` }}
							/>
						</div>
						<div className="flex flex-wrap items-center gap-x-3 text-subhead tabular-nums">
							<span>{pluralCount(row.orders, "order")}</span>
							<span aria-hidden className="text-muted-foreground">
								·
							</span>
							<span>{`AOV ${compactMoney(aov)}`}</span>
							<span aria-hidden className="text-muted-foreground">
								·
							</span>
							<span>{`${percentFormatter.format(row.share)} share`}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
};
