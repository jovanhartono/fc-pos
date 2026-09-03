import {
	CaretDownIcon,
	CaretUpDownIcon,
	CaretUpIcon,
} from "@phosphor-icons/react";
import {
	flexRender,
	type RowData,
	type Table as TanstackTable,
} from "@tanstack/react-table";
import type { DataTableFeatures } from "@/components/data-table-features";
import "@/components/data-table-meta";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableGridProps<TData extends RowData> {
	table: TanstackTable<DataTableFeatures, TData>;
	isLoading?: boolean;
	emptyMessage: string;
	sortable: boolean;
}

export const DataTableGrid = <TData extends RowData>({
	table,
	isLoading,
	emptyMessage,
	sortable,
}: DataTableGridProps<TData>) => (
	// Never cap the height here: an inner scroller left 3 of 4 rows in a long
	// table unreachable, because the page itself then had nothing to scroll.
	<Table>
		<TableHeader>
			{table.getHeaderGroups().map((headerGroup) => (
				<TableRow key={headerGroup.id} className="border-border hover:bg-muted">
					{headerGroup.headers.map((header) => {
						const canSort = sortable && header.column.getCanSort();
						const sortState = header.column.getIsSorted();
						return (
							<TableHead
								key={header.id}
								className={cn(
									"sticky top-0 z-10 h-9 bg-muted font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]",
									header.column.columnDef.meta?.headerClassName,
								)}
							>
								{header.isPlaceholder ? null : canSort ? (
									<button
										type="button"
										onClick={header.column.getToggleSortingHandler()}
										className={cn(
											// Browsers force text-transform:none on <button>, so restate
											// uppercase here to match the non-sortable plain-text headers.
											"flex items-center gap-1 uppercase transition-colors hover:text-foreground",
											sortState && "text-foreground",
										)}
									>
										{flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)}
										{sortState === "asc" ? (
											<CaretUpIcon className="size-3" weight="bold" />
										) : sortState === "desc" ? (
											<CaretDownIcon className="size-3" weight="bold" />
										) : (
											<CaretUpDownIcon
												className="size-3 opacity-50"
												weight="bold"
											/>
										)}
									</button>
								) : (
									flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)
								)}
							</TableHead>
						);
					})}
				</TableRow>
			))}
		</TableHeader>
		<TableBody>
			{isLoading ? (
				<TableRow>
					<TableCell
						colSpan={table.getAllLeafColumns().length || 1}
						className="h-20 text-center font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em] md:h-24"
					>
						Loading…
					</TableCell>
				</TableRow>
			) : table.getRowModel().rows.length ? (
				table.getRowModel().rows.map((row) => (
					<TableRow key={row.id} className="border-border/60">
						{row.getAllCells().map((cell) => (
							<TableCell
								key={cell.id}
								className={cn(
									"py-3",
									cell.column.columnDef.meta?.cellClassName,
								)}
							>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</TableCell>
						))}
					</TableRow>
				))
			) : (
				<TableRow>
					<TableCell
						colSpan={table.getAllLeafColumns().length || 1}
						className="h-20 text-center font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em] md:h-24"
					>
						{emptyMessage}
					</TableCell>
				</TableRow>
			)}
		</TableBody>
	</Table>
);
