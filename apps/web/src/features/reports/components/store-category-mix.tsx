import { OTHER_CATEGORY_ID } from "@fresclean/api/rules";
import { Analytics01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { StatusChipStrip } from "@/components/chip-strip";
import { EmptyState } from "@/components/empty-state";
import { SectionTitle } from "@/components/section";
import { Card, CardContent } from "@/components/ui/card";
import type { FinancialReport } from "@/features/reports/api";
import {
	compactMoney,
	percentFormatter,
} from "@/features/reports/utils/format";
import {
	formatKpiDeltaChange,
	kpiDeltaChange,
} from "@/features/reports/utils/kpi-delta";
import {
	CHART_OTHER_COLOR,
	CHART_PALETTE,
} from "@/features/reports/utils/palette";
import { cn } from "@/lib/utils";

type Matrix = FinancialReport["store_category_matrix"];
type MatrixRow = Matrix["rows"][number];

interface StoreCategoryMixCardProps {
	matrix: Matrix;
}

const ALL = "all";

// Unlike the other report charts, every named Category keeps its own colour:
// the owner found the 5th to 7th sharing grey confusing.
const categoryColor = (categoryId: number, index: number) =>
	categoryId === OTHER_CATEGORY_ID ? CHART_OTHER_COLOR : CHART_PALETTE[index];

// One bar per Store, cut by Category: an owner sees that one Store lives on
// Repair while another lives on Deep Clean. Picking a Category lights its
// slice in every Store and shows how far each sits from all Stores together.
export const StoreCategoryMixCard = ({ matrix }: StoreCategoryMixCardProps) => {
	const [pickedValue, setPickedValue] = useState(ALL);
	const { columns, rows } = matrix;
	// A Category can drop out of the top list when the range changes.
	const picked = columns.find((col) => String(col.category_id) === pickedValue);
	// Column totals cover every Store, including any left off the list.
	const allStores = columns.reduce((sum, col) => sum + col.gross_sales, 0);
	const average = picked && allStores > 0 ? picked.gross_sales / allStores : 0;
	// A second click on the same slice goes back to All.
	const handlePick = (categoryId: number) =>
		setPickedValue(
			categoryId === picked?.category_id ? ALL : String(categoryId),
		);
	return (
		<Card className="border-border/70 py-0">
			<CardContent className="grid gap-4 p-4">
				<SectionTitle title="Category Mix by Store" />
				{rows.every((row) => row.total === 0) ? (
					<EmptyState icon={Analytics01Icon}>No data in range.</EmptyState>
				) : (
					<>
						<StatusChipStrip
							chips={[
								{ value: ALL, label: "All" },
								...columns.map((col, index) => ({
									value: String(col.category_id),
									label: col.label,
									color: categoryColor(col.category_id, index),
								})),
							]}
							legend="Category"
							onValueChange={setPickedValue}
							value={picked ? pickedValue : ALL}
						/>
						<ul className="grid gap-4">
							{rows.map((row) => (
								<StoreMixRow
									average={average}
									columns={columns}
									key={row.store_id}
									onPick={handlePick}
									pickedId={picked?.category_id ?? null}
									row={row}
								/>
							))}
						</ul>
						{matrix.omitted_stores > 0 && (
							<p className="text-subhead text-muted-foreground">
								{`+${matrix.omitted_stores} more Store${matrix.omitted_stores === 1 ? "" : "s"}`}
							</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
};

interface StoreMixRowProps {
	row: MatrixRow;
	columns: Matrix["columns"];
	pickedId: number | null;
	// The picked Category's share across all Stores.
	average: number;
	onPick: (categoryId: number) => void;
}

const StoreMixRow = ({
	row,
	columns,
	pickedId,
	average,
	onPick,
}: StoreMixRowProps) => {
	const cell = row.cells.find((c) => c.category_id === pickedId);
	const top = row.cells.reduce((a, b) => (b.share > a.share ? b : a));
	const topLabel = columns.find(
		(col) => col.category_id === top.category_id,
	)?.label;
	return (
		<li className="grid gap-1.5">
			<div className="flex items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-2 text-body font-medium">
					<span className="font-normal text-subhead tabular-nums">
						{row.store_code}
					</span>
					<span className="truncate">{row.store_name}</span>
				</span>
				<span className="shrink-0 text-body tabular-nums">
					{cell
						? `${percentFormatter.format(cell.share)} · ${compactMoney(cell.gross_sales)}`
						: compactMoney(row.total)}
				</span>
			</div>
			{/* A mouse shortcut for the pills, which stay the keyboard way in. */}
			<div aria-hidden className="-my-1.5 flex gap-0.5">
				{row.cells.map((c, index) =>
					c.share <= 0 ? null : (
						<button
							className="min-w-0.5 cursor-pointer py-1.5"
							key={c.category_id}
							onClick={() => onPick(c.category_id)}
							style={{ flexGrow: c.share, flexBasis: 0 }}
							tabIndex={-1}
							type="button"
						>
							<span
								className={cn(
									"block h-2.5 rounded-full transition-opacity duration-300 ease-out motion-reduce:transition-none",
									pickedId !== null &&
										c.category_id !== pickedId &&
										"opacity-25",
								)}
								style={{
									backgroundColor: categoryColor(c.category_id, index),
								}}
							/>
						</button>
					),
				)}
			</div>
			<p className="text-subhead tabular-nums">
				{cell ? (
					<>
						<span className="text-muted-foreground">
							All Stores {percentFormatter.format(average)} ·{" "}
						</span>
						{formatKpiDeltaChange(
							kpiDeltaChange(
								{ current: cell.share, previous: average, delta_pct: null },
								"points",
							),
							"points",
						)}
					</>
				) : (
					<>
						<span className="text-muted-foreground">Mostly </span>
						{topLabel} {percentFormatter.format(top.share)}
					</>
				)}
			</p>
		</li>
	);
};
