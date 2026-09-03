import {
	type ColumnDef,
	createSortedRowModel,
	type Row,
	type RowData,
	rowSortingFeature,
	sortFns,
	tableFeatures,
} from "@tanstack/react-table";

// Every admin list shares one feature set. v9 threads it through each table,
// column and row type, so routes type their columns with the aliases below
// instead of naming the features themselves.
export const dataTableFeatures = tableFeatures({
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	// The registry keeps v8's behaviour of picking a sort per column
	// (alphanumeric, datetime, basic) when a column does not name one.
	sortFns,
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumnDef<TData extends RowData> = ColumnDef<
	DataTableFeatures,
	TData
>;
export type DataTableRow<TData extends RowData> = Row<DataTableFeatures, TData>;
