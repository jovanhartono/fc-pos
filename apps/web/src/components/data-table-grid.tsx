import {
	CaretDownIcon,
	CaretUpDownIcon,
	CaretUpIcon,
} from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
	flexRender,
	type RowData,
	type Table as TanstackTable,
} from "@tanstack/react-table";
import { type ReactNode, useEffect, useRef, useState } from "react";
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
import { isListKeyBlocked } from "@/lib/list-keys";
import { cn } from "@/lib/utils";

interface DataTableGridProps<TData extends RowData> {
	table: TanstackTable<DataTableFeatures, TData>;
	isLoading?: boolean;
	emptyMessage: string;
	sortable: boolean;
	getRowLink?: (row: TData) => LinkProps;
	isRowActive?: (row: TData) => boolean;
	footer?: ReactNode;
}

// Links and buttons in a cell sit above the whole-row link, so the customer
// name on an order row still opens the Customer.
const RAISED_CONTROLS =
	"[&_a:not([data-row-link])]:relative [&_button]:relative";

export const DataTableGrid = <TData extends RowData>({
	table,
	isLoading,
	emptyMessage,
	sortable,
	getRowLink,
	isRowActive,
	footer,
}: DataTableGridProps<TData>) => {
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

	return (
		// Only the rows scroll, so paging through five pages is five clicks on
		// Next without scrolling back down each time.
		<div
			ref={frameRef}
			className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card"
		>
			<Table containerClassName="min-h-0 overflow-auto">
				{/* Column names over no rows read as a broken box, so an empty list is just its message. */}
				<TableHeader className={cn(!isLoading && rowCount === 0 && "hidden")}>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow
							key={headerGroup.id}
							className="border-border hover:bg-transparent"
						>
							{headerGroup.headers.map((header) => {
								const canSort = sortable && header.column.getCanSort();
								const sortState = header.column.getIsSorted();
								const isRight = header.column.columnDef.meta?.align === "right";
								return (
									<TableHead
										key={header.id}
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
				<TableBody ref={bodyRef}>
					{isLoading ? (
						<TableRow>
							<TableCell
								colSpan={table.getAllLeafColumns().length || 1}
								className="h-20 text-center text-muted-foreground text-body md:h-24"
							>
								Loading…
							</TableCell>
						</TableRow>
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
									getRowLink && "relative cursor-pointer",
								)}
							>
								{row.getAllCells().map((cell, cellIndex) => (
									<TableCell
										key={cell.id}
										className={cn(
											"py-3 first:pl-3 last:pr-3",
											cell.column.columnDef.meta?.align === "right" &&
												"text-right tabular-nums",
											getRowLink && RAISED_CONTROLS,
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
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell
								colSpan={table.getAllLeafColumns().length || 1}
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
