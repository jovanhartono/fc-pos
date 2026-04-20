import {
	CaretDownIcon,
	CaretUpDownIcon,
	CaretUpIcon,
} from "@phosphor-icons/react";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type RowData,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface DataTableProps<TData extends RowData> {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	isLoading?: boolean;
	emptyMessage?: string;
	sortable?: boolean;
	cardPrimaryColumnId?: string;
	cardHiddenColumnIds?: string[];
}

function getColumnKey<TData extends RowData>(
	column: ColumnDef<TData, unknown>,
): string {
	if ("id" in column && column.id) {
		return column.id;
	}
	if ("accessorKey" in column && column.accessorKey) {
		return String(column.accessorKey);
	}
	return String(column.header ?? "column");
}

export function DataTable<TData extends RowData>({
	columns,
	data,
	isLoading,
	emptyMessage = "No data found",
	sortable = false,
	cardPrimaryColumnId,
	cardHiddenColumnIds,
}: DataTableProps<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const isMobile = useIsMobile();

	const table = useReactTable({
		data,
		columns,
		state: sortable ? { sorting } : undefined,
		onSortingChange: sortable ? setSorting : undefined,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: sortable ? getSortedRowModel() : undefined,
	});

	const colSpan = Math.max(columns.length, 1);

	if (isMobile) {
		if (isLoading) {
			return (
				<div className="grid gap-2 md:hidden">
					{Array.from({ length: 3 }, (_, index) => (
						<div
							key={index}
							className="h-24 animate-pulse border border-border bg-muted/40"
						/>
					))}
				</div>
			);
		}

		if (data.length === 0) {
			return (
				<div className="border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground md:hidden">
					{emptyMessage}
				</div>
			);
		}

		const primaryColumnKey =
			cardPrimaryColumnId ??
			getColumnKey(columns[0] ?? ({} as ColumnDef<TData, unknown>));
		const hiddenIds = new Set(cardHiddenColumnIds ?? []);

		return (
			<div className="grid gap-2 md:hidden">
				{table.getRowModel().rows.map((row) => {
					const visibleCells = row.getVisibleCells();
					const primaryCell = visibleCells.find(
						(cell) => cell.column.id === primaryColumnKey,
					);
					const otherCells = visibleCells.filter(
						(cell) =>
							cell.column.id !== primaryColumnKey &&
							!hiddenIds.has(cell.column.id),
					);

					return (
						<article
							key={row.id}
							className="grid gap-2 border border-border bg-background p-3 text-sm"
						>
							{primaryCell ? (
								<div className="font-semibold">
									{flexRender(
										primaryCell.column.columnDef.cell,
										primaryCell.getContext(),
									)}
								</div>
							) : null}
							<dl className="grid gap-1.5">
								{otherCells.map((cell) => {
									const headerDef = cell.column.columnDef.header;
									const headerLabel =
										typeof headerDef === "string" ? headerDef : cell.column.id;
									return (
										<div
											key={cell.id}
											className="flex items-baseline justify-between gap-3"
										>
											<dt className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
												{headerLabel}
											</dt>
											<dd className="text-right">
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</dd>
										</div>
									);
								})}
							</dl>
						</article>
					);
				})}
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow key={headerGroup.id}>
						{headerGroup.headers.map((header) => {
							const canSort = sortable && header.column.getCanSort();
							const sortState = header.column.getIsSorted();
							return (
								<TableHead key={header.id}>
									{header.isPlaceholder ? null : canSort ? (
										<button
											type="button"
											onClick={header.column.getToggleSortingHandler()}
											className={cn(
												"flex items-center gap-1 font-medium text-foreground hover:text-foreground/80",
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
							colSpan={colSpan}
							className="h-20 text-center text-muted-foreground md:h-24"
						>
							Loading...
						</TableCell>
					</TableRow>
				) : table.getRowModel().rows.length ? (
					table.getRowModel().rows.map((row) => (
						<TableRow key={row.id}>
							{row.getVisibleCells().map((cell) => (
								<TableCell key={cell.id}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</TableCell>
							))}
						</TableRow>
					))
				) : (
					<TableRow>
						<TableCell
							colSpan={colSpan}
							className="h-20 text-center text-muted-foreground md:h-24"
						>
							{emptyMessage}
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}
