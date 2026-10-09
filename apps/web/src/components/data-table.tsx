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
	emptyMessage?: string;
	sortable?: boolean;
	cardPrimaryColumnId?: string;
	cardHiddenColumnIds?: string[];
	getCardLink?: (row: TData) => LinkProps;
	// The row whose record is open beside the list.
	isRowActive?: (row: TData) => boolean;
	// The pager, kept in reach: under the rows on desktop, above the tab bar on a phone.
	footer?: ReactNode;
}

// A code is read character by character, a name is what the eye looks for
// first. Wrapped once here, so the table and the phone card both get it.
const KIND_CLASS = { code: "font-mono", name: "font-medium" } as const;

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
			cell: (context: CellContext<DataTableFeatures, TData, unknown>) => (
				<span className={KIND_CLASS[kind]}>
					{render
						? flexRender(render, context)
						: String(context.getValue() ?? "")}
				</span>
			),
		};
	});

export const DataTable = <TData extends RowData>({
	columns,
	data,
	isLoading,
	emptyMessage = "No data found",
	sortable = false,
	cardPrimaryColumnId,
	cardHiddenColumnIds,
	getCardLink,
	isRowActive,
	footer,
}: DataTableProps<TData>) => {
	const [sorting, setSorting] = useState<SortingState>([]);
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
		state: sortable ? { sorting } : undefined,
		onSortingChange: sortable ? setSorting : undefined,
	});

	if (isCardView) {
		return (
			<>
				<DataTableCards
					table={table}
					isLoading={isLoading}
					emptyMessage={emptyMessage}
					cardPrimaryColumnId={cardPrimaryColumnId}
					cardHiddenColumnIds={cardHiddenColumnIds}
					getCardLink={getCardLink}
					isRowActive={isRowActive}
				/>
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
			emptyMessage={emptyMessage}
			sortable={sortable}
			isRowActive={isRowActive}
			footer={footer}
		/>
	);
};
