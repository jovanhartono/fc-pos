import {
	type RankRow,
	RankRows,
} from "@/features/reports/components/rank-rows";
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
export const storeRankRows = (rows: StoreRevenueRow[]): RankRow[] =>
	rows.map((row) => ({
		key: row.store_id,
		code: row.store_code,
		name: row.store_name,
		value: row.revenue,
		notes: [
			pluralCount(row.orders, "order"),
			`AOV ${compactMoney(row.orders > 0 ? row.revenue / row.orders : 0)}`,
			`${percentFormatter.format(row.share)} share`,
		],
	}));

export const StoreRevenueRows = ({ rows }: StoreRevenueRowsProps) => (
	<RankRows rows={storeRankRows(rows)} />
);
