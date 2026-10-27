import {
	ArrowDown01Icon,
	ArrowUp01Icon,
	UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
	flexRender,
	type RowData,
	type Table as TanstackTable,
} from "@tanstack/react-table";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DataTableFeatures } from "@/components/data-table-features";
import type { ColumnWidth } from "@/components/data-table-meta";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { CONTENT_FADE, staleFade } from "@/lib/content-fade";
import { isListKeyBlocked } from "@/lib/list-keys";
import { cn } from "@/lib/utils";

interface DataTableGridProps<TData extends RowData> {
	table: TanstackTable<DataTableFeatures, TData>;
	isLoading?: boolean;
	isStale?: boolean;
	resultSet?: string;
	skeletonRowCount?: number;
	skeletonLines?: 1 | 2 | "wrapped";
	emptyMessage: string;
	sortable: boolean;
	getRowLink?: (row: TData) => LinkProps;
	onRowOpen?: (row: TData) => void;
	isInsideCard?: boolean;
	isRowActive?: (row: TData) => boolean;
	footer?: ReactNode;
}

// Links and buttons in a cell sit above the whole-row link, so the customer
// name on an order row still opens the Customer.
const RAISED_CONTROLS =
	"[&_a:not([data-row-link])]:relative [&_button:not([data-row-link])]:relative";

const SKELETON_ROW_COUNT = 10;

// Spare room goes to every column by its share, not all to the Customer. Once a
// column hits its minimum the table scrolls sideways, so a 1024px screen with the
// sidebar open never squeezes a column away.
const tableMinWidthRem = (widths: (ColumnWidth | undefined)[]) =>
	widths.reduce(
		(widest, width) =>
			width ? Math.max(widest, (width.minRem * 100) / width.percent) : widest,
		0,
	);

export const DataTableGrid = <TData extends RowData>({
	table,
	isLoading,
	isStale,
	resultSet,
	skeletonRowCount = SKELETON_ROW_COUNT,
	skeletonLines = 2,
	emptyMessage,
	sortable,
	getRowLink,
	onRowOpen,
	isInsideCard,
	isRowActive,
	footer,
}: DataTableGridProps<TData>) => {
	const isRowOpenable = getRowLink !== undefined || onRowOpen !== undefined;
	const frameRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLTableSectionElement>(null);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const rows = table.getRowModel().rows;
	const rowCount = rows.length;

	// While a row is open in the sheet over the list, its fill is the only marker; on
	// close the ring is waiting on it, so J carries on from the last one opened.
	const activeIndex = isRowActive
		? rows.findIndex((row) => isRowActive(row.original))
		: -1;

	// A new page or filter is a new list; the ring starts over above it, or on
	// the open row when a payment in the sheet refreshed the same list.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new rows
	useEffect(() => {
		setFocusedIndex(activeIndex);
	}, [rows]);
	useEffect(() => {
		if (activeIndex >= 0) {
			setFocusedIndex(activeIndex);
		}
	}, [activeIndex]);

	useEffect(() => {
		// J/K walk the rows and Enter opens the one in the ring, so a cashier
		// working down the Ready list never reaches for the mouse.
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isListKeyBlocked(event)) {
				return;
			}
			if (event.key === "/") {
				const search = frameRef.current
					?.closest("[data-list-panel]")
					?.querySelector<HTMLInputElement>("[data-list-search]");
				if (search) {
					event.preventDefault();
					search.focus();
				}
				return;
			}
			if (rowCount === 0) {
				return;
			}
			if (event.key === "j" || event.key === "k") {
				event.preventDefault();
				setFocusedIndex((current) =>
					event.key === "j"
						? Math.min(current + 1, rowCount - 1)
						: Math.max(current - 1, 0),
				);
				return;
			}
			// Only when nothing else has focus: Enter on a focused button (Next,
			// a sort header, a nav link) must still press that button.
			if (event.key === "Enter" && event.target === document.body) {
				const target = bodyRef.current?.querySelector<HTMLElement>(
					"[data-focused] a, [data-focused] button",
				);
				if (target) {
					event.preventDefault();
					target.click();
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [rowCount]);

	useEffect(() => {
		if (focusedIndex < 0) {
			return;
		}
		bodyRef.current?.children[focusedIndex]?.scrollIntoView({
			block: "nearest",
		});
	}, [focusedIndex]);

	const columnCount = table.getAllLeafColumns().length || 1;
	const minWidthRem = tableMinWidthRem(
		table.getAllLeafColumns().map((column) => column.columnDef.meta?.width),
	);

	return (
		// Only the rows scroll, so paging through five pages is five clicks on
		// Next without scrolling back down each time.
		<div
			ref={frameRef}
			className={cn(
				"flex min-h-0 flex-1 flex-col overflow-hidden bg-card",
				!isInsideCard && "rounded-lg border",
			)}
		>
			{/* Fixed columns: each column's width is set once on the column, so a
			    new page or filter never slides the columns sideways. */}
			<Table
				className="table-fixed"
				containerClassName="min-h-0 flex-1 overflow-auto"
				style={{ minWidth: `${minWidthRem}rem` }}
			>
				{/* Column names over no rows read as a broken box, so an empty list
				    hides them but keeps their row, and its message sits where the
				    first row would. */}
				<TableHeader
					className={cn(!isLoading && rowCount === 0 && "invisible")}
				>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow
							key={headerGroup.id}
							className="border-border hover:bg-transparent"
						>
							{headerGroup.headers.map((header) => {
								const canSort = sortable && header.column.getCanSort();
								const sortState = header.column.getIsSorted();
								const isRight = header.column.columnDef.meta?.align === "right";
								const width = header.column.columnDef.meta?.width;
								return (
									<TableHead
										key={header.id}
										style={width ? { width: `${width.percent}%` } : undefined}
										className={cn(
											"sticky top-0 z-10 h-9 bg-card font-medium text-muted-foreground text-subhead shadow-[inset_0_-1px_0_var(--border)] first:pl-3 last:pr-3",
											isRight && "text-right",
											header.column.columnDef.meta?.headerClassName,
										)}
									>
										{header.isPlaceholder ? null : canSort ? (
											<button
												type="button"
												onClick={header.column.getToggleSortingHandler()}
												className={cn(
													"flex items-center gap-1 transition-colors hover:text-foreground",
													isRight && "ml-auto",
													sortState && "text-foreground",
												)}
											>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
												{sortState === "asc" ? (
													<HugeiconsIcon
														icon={ArrowUp01Icon}
														className="size-3"
														strokeWidth={2}
													/>
												) : sortState === "desc" ? (
													<HugeiconsIcon
														icon={ArrowDown01Icon}
														className="size-3"
														strokeWidth={2}
													/>
												) : (
													<HugeiconsIcon
														icon={UnfoldMoreIcon}
														className="size-3 opacity-50"
														strokeWidth={2}
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
				<TableBody
					key={isLoading ? "loading" : `rows:${resultSet}`}
					ref={bodyRef}
					className={cn(!isLoading && CONTENT_FADE, staleFade(isStale))}
				>
					{isLoading ? (
						Array.from({ length: skeletonRowCount }, (_, rowIndex) => (
							<TableRow
								key={rowIndex}
								aria-hidden
								className="border-border/60 hover:bg-transparent"
							>
								{Array.from({ length: columnCount }, (_, cellIndex) => (
									<TableCell
										key={cellIndex}
										className="py-3 first:pl-3 last:pr-3"
									>
										{/* Two lines, the height of a code over its store or a name over its phone. */}
										{skeletonLines === 2 ? (
											<div className="grid gap-0.5">
												<Skeleton className="my-0.5 h-3.5 w-3/4" />
												<Skeleton className="my-0.5 h-2.5 w-1/2" />
											</div>
										) : skeletonLines === "wrapped" ? (
											// An Item code wrapped over two lines of the table's text.
											<div className="grid">
												<Skeleton className="my-0.75 h-3 w-3/4" />
												<Skeleton className="my-0.75 h-3 w-1/2" />
											</div>
										) : (
											<Skeleton className="my-0.5 h-5 w-3/4" />
										)}
									</TableCell>
								))}
							</TableRow>
						))
					) : rows.length ? (
						rows.map((row, index) => (
							<TableRow
								key={row.id}
								data-focused={
									(activeIndex < 0 && index === focusedIndex) || undefined
								}
								data-state={index === activeIndex ? "selected" : undefined}
								className={cn(
									"scroll-mt-9 border-border/60 data-focused:bg-muted/60 data-focused:outline-2 data-focused:outline-primary data-focused:-outline-offset-2 data-[state=selected]:bg-primary/10",
									// iPhone Safari ignores `relative` on a row: every row's tap area
									// covered the whole table and each tap opened the last Order.
									isRowOpenable && "cursor-pointer [transform:translate(0)]",
								)}
							>
								{row.getAllCells().map((cell, cellIndex) => (
									<TableCell
										key={cell.id}
										className={cn(
											"wrap-break-word whitespace-normal py-3 first:pl-3 last:pr-3",
											cell.column.columnDef.meta?.align === "right" &&
												"text-right tabular-nums",
											isRowOpenable && RAISED_CONTROLS,
											cell.column.columnDef.meta?.cellClassName,
										)}
									>
										{getRowLink && cellIndex === 0 ? (
											<Link
												{...getRowLink(row.original)}
												aria-hidden
												tabIndex={-1}
												preload={false}
												data-row-link
												className="absolute inset-0"
											/>
										) : null}
										{onRowOpen && !getRowLink && cellIndex === 0 ? (
											<button
												type="button"
												aria-hidden
												tabIndex={-1}
												data-row-link
												onClick={() => onRowOpen(row.original)}
												className="absolute inset-0"
											/>
										) : null}
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell
								colSpan={columnCount}
								className="h-20 text-center text-body md:h-24"
							>
								{emptyMessage}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
			{footer ? (
				<div className="shrink-0 border-t px-3 py-2">{footer}</div>
			) : null}
		</div>
	);
};
