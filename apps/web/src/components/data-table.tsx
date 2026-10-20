import type { LinkProps } from "@tanstack/react-router";
import {
	type CellContext,
	flexRender,
	type RowData,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import { type ReactNode, useMemo, useState } from "react";
import { DataTableCards } from "@/components/data-table-cards";
import {
	type DataTableColumnDef,
	type DataTableFeatures,
	dataTableFeatures,
} from "@/components/data-table-features";
import { DataTableGrid } from "@/components/data-table-grid";
import { useIsMobile } from "@/hooks/use-mobile";

interface DataTableProps<TData extends RowData> {
	columns: DataTableColumnDef<TData>[];
	data: TData[];
	isLoading?: boolean;
	// The rows on screen belong to the last filter or page; the new ones are on their way.
	isStale?: boolean;
	// The filter and page the rows answer; a new one draws new rows.
	filterKey?: string;
	// How many placeholder rows to draw, when the rows coming are known.
	skeletonRowCount?: number;
	// The height of a typical phone card, so the placeholders are the cards' size.
	skeletonCardClassName?: string;
	// Desktop placeholder rows are a name over a smaller line, unless every row
	// is one line, or two wrapped lines of the table's own text.
	skeletonLines?: 1 | 2 | "wrapped";
	emptyMessage?: string;
	sortable?: boolean;
	cardPrimaryColumnId?: string;
	cardHiddenColumnIds?: string[];
	// Opens the record from anywhere on its row or card.
	getRowLink?: (row: TData) => LinkProps;
	// Phone rows share one card; for lists of one-line records, not Orders.
	isCardGrouped?: boolean;
	// Phone rows the page draws itself, inside one grouped card.
	renderCard?: (row: TData) => ReactNode;
	// The row whose record is open in the sheet over the list.
	isRowActive?: (row: TData) => boolean;
	// The pager, kept in reach: under the rows on desktop, above the tab bar on a phone.
	footer?: ReactNode;
}

// A code is read character by character, a name is what the eye looks for
// first. Wrapped once here, so the table and the phone card both get it.
// On the table a long name or description wraps inside its column's fixed
// width and stops at two lines, so one long value never makes its row taller.
// Exported for cells that stack a name over a second line, where kind would bold both.
export const WRAP_NAME_CLASS = "lg:wrap-break-word";

const KIND_CLASS = {
	code: "tabular-nums",
	name: `font-medium lg:line-clamp-2 ${WRAP_NAME_CLASS}`,
	text: "lg:line-clamp-2",
} as const;

const withKindStyles = <TData extends RowData>(
	columns: DataTableColumnDef<TData>[],
) =>
	columns.map((column): DataTableColumnDef<TData> => {
		const kind = column.meta?.kind;
		if (!kind) {
			return column;
		}
		const render = column.cell;
		return {
			...column,
			cell: (context: CellContext<DataTableFeatures, TData, unknown>) => {
				const value = context.getValue();
				return (
					<span
						className={KIND_CLASS[kind]}
						title={
							kind === "text" && typeof value === "string" ? value : undefined
						}
					>
						{render ? flexRender(render, context) : String(value ?? "")}
					</span>
				);
			},
		};
	});

export const DataTable = <TData extends RowData>({
	columns,
	data,
	isLoading,
	isStale,
	filterKey,
	skeletonRowCount,
	skeletonCardClassName,
	skeletonLines,
	emptyMessage = "Nothing here.",
	sortable = false,
	cardPrimaryColumnId,
	cardHiddenColumnIds,
	getRowLink,
	isCardGrouped,
	renderCard,
	isRowActive,
	footer,
}: DataTableProps<TData>) => {
	const [sorting, setSorting] = useState<SortingState>([]);
	// When a cashier's new filter lands, its rows are drawn fresh rather than the
	// last filter's rows moved to new places, which the browser counts as the page
	// jumping. The faded rows still answer the last filter; a refresh keeps its rows.
	const [resultSet, setResultSet] = useState(filterKey);
	if (!isStale && resultSet !== filterKey) {
		setResultSet(filterKey);
	}
	// Sidebar stays expanded until lg, leaving too little width for a real
	// table at tablet — render the card layout up to lg instead of md.
	const isCardView = useIsMobile(1024);

	// One instance for both layouts, so a sort picked on the desktop table
	// survives a tablet rotation into the card list.
	const styledColumns = useMemo(() => withKindStyles(columns), [columns]);
	const table = useTable({
		features: dataTableFeatures,
		data,
		columns: styledColumns,
		// Rows keyed by their record, so a filter that drops one campaign doesn't
		// pour the next campaign into its card and resize it.
		getRowId: (row, index) =>
			typeof row === "object" && row !== null && "id" in row
				? String(row.id)
				: String(index),
		state: sortable ? { sorting } : undefined,
		onSortingChange: sortable ? setSorting : undefined,
	});

	if (isCardView) {
		return (
			<>
				{/* Grows to the foot of the list, so the pager rests at the bottom of
				    the screen however few cards a filter returns. */}
				<div className="flex-1">
					<DataTableCards
						table={table}
						isLoading={isLoading}
						isStale={isStale}
						resultSet={resultSet}
						skeletonRowCount={skeletonRowCount}
						skeletonCardClassName={skeletonCardClassName}
						emptyMessage={emptyMessage}
						cardPrimaryColumnId={cardPrimaryColumnId}
						cardHiddenColumnIds={cardHiddenColumnIds}
						getCardLink={getRowLink}
						isGrouped={isCardGrouped || renderCard !== undefined}
						renderCard={renderCard}
						isRowActive={isRowActive}
					/>
				</div>
				{footer ? (
					// Pinned like the queue's Hold to Start Work bar.
					<div
						className="sticky bottom-0 z-10 -mx-3 mt-1 border-t bg-background px-3 pt-2 pb-[calc(var(--inset-bottom)+0.5rem)] sm:-mx-6 sm:px-6 md:-mx-8 md:px-8"
						data-bottom-bar
					>
						{footer}
					</div>
				) : null}
			</>
		);
	}

	return (
		<DataTableGrid
			table={table}
			isLoading={isLoading}
			isStale={isStale}
			resultSet={resultSet}
			skeletonRowCount={skeletonRowCount}
			skeletonLines={skeletonLines}
			emptyMessage={emptyMessage}
			sortable={sortable}
			getRowLink={getRowLink}
			isRowActive={isRowActive}
			footer={footer}
		/>
	);
};
