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
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { DataTableFeatures } from "@/components/data-table-features";
import "@/components/data-table-meta";
import { KeyHint } from "@/components/key-hint";
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
	isRowActive?: (row: TData) => boolean;
	footer?: ReactNode;
}

export const DataTableGrid = <TData extends RowData>({
	table,
	isLoading,
	emptyMessage,
	sortable,
	isRowActive,
	footer,
}: DataTableGridProps<TData>) => {
	const frameRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLTableSectionElement>(null);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const rows = table.getRowModel().rows;
	const rowCount = rows.length;

	// A new page or filter is a new list; the ring starts over above it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new rows
	useEffect(() => {
		setFocusedIndex(-1);
	}, [rows]);

	// While a row is open beside the list, its fill is the only marker; on
	// close the ring is waiting on it, so J carries on from the last one opened.
	const activeIndex = isRowActive
		? rows.findIndex((row) => isRowActive(row.original))
		: -1;
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
			className="flex min-h-0 flex-col border border-border bg-background"
		>
			<Table containerClassName="min-h-0 overflow-auto">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow
							key={headerGroup.id}
							className="border-border hover:bg-muted"
						>
							{headerGroup.headers.map((header) => {
								const canSort = sortable && header.column.getCanSort();
								const sortState = header.column.getIsSorted();
								const isRight = header.column.columnDef.meta?.align === "right";
								return (
									<TableHead
										key={header.id}
										className={cn(
											"sticky top-0 z-10 h-9 bg-muted font-medium text-muted-foreground text-xs first:pl-3 last:pr-3",
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
								className="h-20 text-center text-muted-foreground text-sm md:h-24"
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
								className="scroll-mt-9 border-border/60 data-focused:bg-muted/60 data-focused:outline-2 data-focused:outline-foreground data-focused:-outline-offset-2 data-[state=selected]:[&>td:first-child]:shadow-[inset_2px_0_0_var(--foreground)]"
							>
								{row.getAllCells().map((cell) => (
									<TableCell
										key={cell.id}
										className={cn(
											"py-3 first:pl-3 last:pr-3",
											cell.column.columnDef.meta?.align === "right" &&
												"text-right tabular-nums",
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
								className="h-20 text-center text-muted-foreground text-sm md:h-24"
							>
								{emptyMessage}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
			{rowCount > 0 ? (
				<div className="flex shrink-0 items-center gap-5 border-t bg-muted/50 px-3 py-1.5 text-muted-foreground text-xs">
					<KeyHint keys={["J", "K"]} label="move" />
					<KeyHint keys={["↵"]} label="open" />
					{footer ? <KeyHint keys={["[", "]"]} label="page" /> : null}
					<KeyHint
						keys={["/"]}
						label="search"
						className="hidden items-center gap-1.5 group-has-[[data-list-search]]/list:inline-flex"
					/>
				</div>
			) : null}
			{footer ? (
				<div className="shrink-0 border-t px-3 py-2">{footer}</div>
			) : null}
		</div>
	);
};
