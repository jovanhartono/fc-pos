import {
	type RowData,
	type SortingState,
	useTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { DataTableCards } from "@/components/data-table-cards";
import {
	type DataTableColumnDef,
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
}

export const DataTable = <TData extends RowData>({
	columns,
	data,
	isLoading,
	emptyMessage = "No data found",
	sortable = false,
	cardPrimaryColumnId,
	cardHiddenColumnIds,
}: DataTableProps<TData>) => {
	const [sorting, setSorting] = useState<SortingState>([]);
	// Sidebar stays expanded until lg, leaving too little width for a real
	// table at tablet — render the card layout up to lg instead of md.
	const isCardView = useIsMobile(1024);

	// One instance for both layouts, so a sort picked on the desktop table
	// survives a tablet rotation into the card list.
	const table = useTable({
		features: dataTableFeatures,
		data,
		columns,
		state: sortable ? { sorting } : undefined,
		onSortingChange: sortable ? setSorting : undefined,
	});

	if (isCardView) {
		return (
			<DataTableCards
				table={table}
				isLoading={isLoading}
				emptyMessage={emptyMessage}
				cardPrimaryColumnId={cardPrimaryColumnId}
				cardHiddenColumnIds={cardHiddenColumnIds}
			/>
		);
	}

	return (
		<DataTableGrid
			table={table}
			isLoading={isLoading}
			emptyMessage={emptyMessage}
			sortable={sortable}
		/>
	);
};
