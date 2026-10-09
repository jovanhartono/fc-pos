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
	footer?: ReactNode;
}

interface KeyHintProps {
	keys: string[];
	label: string;
}

const KeyHint = ({ keys, label }: KeyHintProps) => (
	<span className="inline-flex items-center gap-1.5">
		{keys.map((key) => (
			<kbd
				key={key}
				className="inline-grid h-5 min-w-5 place-items-center border border-b-2 bg-background px-1 font-mono text-[11px] text-foreground"
			>
				{key}
			</kbd>
		))}
		{label}
	</span>
);

export const DataTableGrid = <TData extends RowData>({
	table,
	isLoading,
	emptyMessage,
	sortable,
	footer,
}: DataTableGridProps<TData>) => {
	const frameRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLTableSectionElement>(null);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const [hasSearch, setHasSearch] = useState(false);
	const rows = table.getRowModel().rows;
	const rowCount = rows.length;

	// A new page or filter is a new list; the ring starts over above it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new rows
	useEffect(() => {
		setFocusedIndex(-1);
	}, [rows]);

	useEffect(() => {
		const search = frameRef.current
			?.closest("[data-list-panel]")
			?.querySelector<HTMLInputElement>("input");
		setHasSearch(search != null);

		// J/K walk the rows and Enter opens the one in the ring, so a cashier
		// working down the Ready list never reaches for the mouse.
		const handleKeyDown = (event: KeyboardEvent) => {
			if (isListKeyBlocked(event)) {
				return;
			}
			if (event.key === "/" && search) {
				event.preventDefault();
				search.focus();
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
			if (event.key === "Enter" && focusedIndex >= 0) {
				const row = bodyRef.current?.children[focusedIndex];
				const target = row?.querySelector<HTMLElement>("a, button");
				if (target) {
					event.preventDefault();
					target.click();
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [rowCount, focusedIndex]);

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
		// Next. The frame shrinks to the space left instead of a guessed height,
		// which in #97 left rows out of reach.
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
											"sticky top-0 z-10 h-9 bg-muted px-3 font-medium text-muted-foreground text-xs",
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
								data-focused={index === focusedIndex || undefined}
								className="scroll-mt-9 border-border/60 data-focused:bg-muted/60 data-focused:outline-2 data-focused:outline-foreground data-focused:-outline-offset-2"
							>
								{row.getAllCells().map((cell) => (
									<TableCell
										key={cell.id}
										className={cn(
											"px-3 py-3",
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
					{hasSearch ? <KeyHint keys={["/"]} label="search" /> : null}
				</div>
			) : null}
			{footer ? (
				<div className="shrink-0 border-t px-3 py-2">{footer}</div>
			) : null}
		</div>
	);
};
