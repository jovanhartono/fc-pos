import {
	CaretDownIcon,
	CaretUpDownIcon,
	CaretUpIcon,
} from "@phosphor-icons/react";
import {
	type Cell,
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type RowData,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { Fragment, useState } from "react";
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

type MobileCardSlot =
	| "title"
	| "eyebrow"
	| "badges"
	| "detail"
	| "footer"
	| "hidden";

interface MobileCardColumnOptions {
	slot?: MobileCardSlot;
	label?: string;
	className?: string;
	labelClassName?: string;
	valueClassName?: string;
}

declare module "@tanstack/react-table" {
	// biome-ignore lint/correctness/noUnusedVariables: TanStack declaration merging requires these generic names.
	interface ColumnMeta<TData extends RowData, TValue> {
		mobileCard?: MobileCardColumnOptions;
	}
}

interface DataTableProps<TData extends RowData> {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	isLoading?: boolean;
	emptyMessage?: string;
	sortable?: boolean;
	cardPrimaryColumnId?: string;
	cardHiddenColumnIds?: string[];
}

const getColumnKey = <TData extends RowData>(
	column: ColumnDef<TData, unknown>,
): string => {
	if ("id" in column && column.id) {
		return column.id;
	}
	if ("accessorKey" in column && column.accessorKey) {
		return String(column.accessorKey);
	}
	return String(column.header ?? "column");
};

const getCellHeaderLabel = <TData extends RowData>(
	cell: Cell<TData, unknown>,
): string => {
	const mobileCard = cell.column.columnDef.meta?.mobileCard;
	if (mobileCard?.label) {
		return mobileCard.label;
	}
	const headerDef = cell.column.columnDef.header;
	return typeof headerDef === "string" ? headerDef : cell.column.id;
};

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
							className="grid h-32 animate-pulse grid-rows-[auto_1fr_auto] border border-border bg-muted/30"
						>
							<div className="h-7 border-border/70 border-b bg-muted/50" />
							<div className="m-3 h-5 w-2/3 bg-muted/60" />
							<div className="h-10 border-border/70 border-t bg-muted/40" />
						</div>
					))}
				</div>
			);
		}

		if (data.length === 0) {
			return (
				<div className="border border-dashed border-border bg-muted/20 px-6 py-10 text-center font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em] md:hidden">
					{emptyMessage}
				</div>
			);
		}

		const titleColumn = columns.find(
			(column) => column.meta?.mobileCard?.slot === "title",
		);
		const primaryColumnKey =
			cardPrimaryColumnId ??
			(titleColumn
				? getColumnKey(titleColumn)
				: getColumnKey(columns[0] ?? ({} as ColumnDef<TData, unknown>)));
		const hiddenIds = new Set(cardHiddenColumnIds ?? []);

		return (
			<div className="grid gap-2 md:hidden">
				{table.getRowModel().rows.map((row) => {
					const visibleCells = row.getVisibleCells();
					const primaryCell = visibleCells.find(
						(cell) => cell.column.id === primaryColumnKey,
					);
					const usableCells = visibleCells.filter((cell) => {
						const slot = cell.column.columnDef.meta?.mobileCard?.slot;
						return (
							cell.column.id !== primaryColumnKey &&
							!hiddenIds.has(cell.column.id) &&
							slot !== "hidden"
						);
					});
					const eyebrowCells = usableCells.filter(
						(cell) =>
							cell.column.columnDef.meta?.mobileCard?.slot === "eyebrow",
					);
					const badgeCells = usableCells.filter(
						(cell) => cell.column.columnDef.meta?.mobileCard?.slot === "badges",
					);
					const footerCells = usableCells.filter(
						(cell) => cell.column.columnDef.meta?.mobileCard?.slot === "footer",
					);
					const detailCells = usableCells.filter((cell) => {
						const slot = cell.column.columnDef.meta?.mobileCard?.slot;
						return !slot || slot === "detail";
					});
					const primaryConfig = primaryCell?.column.columnDef.meta?.mobileCard;
					const hasHeaderStrip =
						eyebrowCells.length > 0 || footerCells.length > 0;

					return (
						<article
							key={row.id}
							className="group/card relative grid border border-border bg-background text-sm transition-colors hover:border-foreground/40 hover:bg-muted/20 dark:bg-muted/5"
						>
							{hasHeaderStrip ? (
								<div className="flex items-center justify-between gap-3 border-border/70 border-b px-3 py-1.5">
									<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
										{eyebrowCells.map((cell, index) => {
											const mobileCard = cell.column.columnDef.meta?.mobileCard;
											return (
												<Fragment key={cell.id}>
													{index > 0 ? (
														<span
															aria-hidden="true"
															className="text-[10px] text-border"
														>
															/
														</span>
													) : null}
													<span
														className={cn(
															"font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]",
															mobileCard?.className,
														)}
													>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</span>
												</Fragment>
											);
										})}
									</div>
									{footerCells.length > 0 ? (
										<div className="shrink-0 text-right">
											{footerCells.map((cell) => {
												const mobileCard =
													cell.column.columnDef.meta?.mobileCard;
												return (
													<div
														key={cell.id}
														className={cn(
															"font-mono font-semibold text-foreground text-sm tabular-nums",
															mobileCard?.className,
														)}
													>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</div>
												);
											})}
										</div>
									) : null}
								</div>
							) : null}

							{primaryCell || badgeCells.length > 0 ? (
								<div className="grid gap-2 px-3 py-2.5">
									{primaryCell ? (
										<div
											className={cn(
												"min-w-0 font-mono font-semibold text-[15px] text-foreground leading-tight tracking-tight",
												primaryConfig?.className,
											)}
										>
											{flexRender(
												primaryCell.column.columnDef.cell,
												primaryCell.getContext(),
											)}
										</div>
									) : null}
									{badgeCells.length > 0 ? (
										<div className="flex flex-wrap items-center gap-1">
											{badgeCells.map((cell) => {
												const mobileCard =
													cell.column.columnDef.meta?.mobileCard;
												return (
													<div
														key={cell.id}
														className={cn(
															"flex flex-wrap gap-1",
															mobileCard?.className,
														)}
													>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</div>
												);
											})}
										</div>
									) : null}
								</div>
							) : null}

							{detailCells.length > 0 ? (
								<dl className="grid grid-cols-2 border-border/70 border-t bg-muted/30 dark:bg-muted/10">
									{detailCells.map((cell, index) => {
										const mobileCard = cell.column.columnDef.meta?.mobileCard;
										const headerLabel = getCellHeaderLabel(cell);
										const isLeftCol = index % 2 === 0;
										const isFirstRow = index < 2;
										return (
											<div
												key={cell.id}
												className={cn(
													"min-w-0 px-3 py-2",
													!isLeftCol && "border-border/70 border-l",
													!isFirstRow && "border-border/70 border-t",
													mobileCard?.className,
												)}
											>
												<dt
													className={cn(
														"font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]",
														mobileCard?.labelClassName,
													)}
												>
													{headerLabel}
												</dt>
												<dd
													className={cn(
														"mt-0.5 min-w-0 truncate font-medium text-foreground text-sm",
														mobileCard?.valueClassName,
													)}
												>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</dd>
											</div>
										);
									})}
								</dl>
							) : null}
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
					<TableRow
						key={headerGroup.id}
						className="border-border bg-muted/40 hover:bg-muted/40"
					>
						{headerGroup.headers.map((header) => {
							const canSort = sortable && header.column.getCanSort();
							const sortState = header.column.getIsSorted();
							return (
								<TableHead
									key={header.id}
									className="h-9 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]"
								>
									{header.isPlaceholder ? null : canSort ? (
										<button
											type="button"
											onClick={header.column.getToggleSortingHandler()}
											className={cn(
												"flex items-center gap-1 transition-colors hover:text-foreground",
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
							className="h-20 text-center font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em] md:h-24"
						>
							Loading…
						</TableCell>
					</TableRow>
				) : table.getRowModel().rows.length ? (
					table.getRowModel().rows.map((row) => (
						<TableRow key={row.id} className="border-border/60">
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
							className="h-20 text-center font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em] md:h-24"
						>
							{emptyMessage}
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
};
