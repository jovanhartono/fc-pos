import {
	type Cell,
	flexRender,
	type RowData,
	type Table as TanstackTable,
} from "@tanstack/react-table";
import { Fragment } from "react";
import "@/components/data-table-meta";
import { cn } from "@/lib/utils";

interface DataTableCardsProps<TData extends RowData> {
	table: TanstackTable<TData>;
	isLoading?: boolean;
	emptyMessage: string;
	cardPrimaryColumnId?: string;
	cardHiddenColumnIds?: string[];
}

interface CardCells<TData extends RowData> {
	primaryCell?: Cell<TData, unknown>;
	subtitleCells: Cell<TData, unknown>[];
	eyebrowCells: Cell<TData, unknown>[];
	badgeCells: Cell<TData, unknown>[];
	footerCells: Cell<TData, unknown>[];
	detailCells: Cell<TData, unknown>[];
}

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

const bucketCardCells = <TData extends RowData>(
	cells: Cell<TData, unknown>[],
	primaryColumnKey: string,
	hiddenIds: Set<string>,
): CardCells<TData> => {
	const buckets: CardCells<TData> = {
		subtitleCells: [],
		eyebrowCells: [],
		badgeCells: [],
		footerCells: [],
		detailCells: [],
	};

	for (const cell of cells) {
		if (cell.column.id === primaryColumnKey) {
			buckets.primaryCell ??= cell;
			continue;
		}
		if (hiddenIds.has(cell.column.id)) {
			continue;
		}
		const slot = cell.column.columnDef.meta?.mobileCard?.slot;
		if (slot === "subtitle") {
			buckets.subtitleCells.push(cell);
			continue;
		}
		if (slot === "eyebrow") {
			buckets.eyebrowCells.push(cell);
			continue;
		}
		if (slot === "badges") {
			buckets.badgeCells.push(cell);
			continue;
		}
		if (slot === "footer") {
			buckets.footerCells.push(cell);
			continue;
		}
		// A "hidden" slot falls through to nothing — that is the point of it.
		if (!slot || slot === "detail") {
			buckets.detailCells.push(cell);
		}
	}

	return buckets;
};

export const DataTableCards = <TData extends RowData>({
	table,
	isLoading,
	emptyMessage,
	cardPrimaryColumnId,
	cardHiddenColumnIds,
}: DataTableCardsProps<TData>) => {
	if (isLoading) {
		return (
			<div className="grid gap-2 lg:hidden">
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

	const rows = table.getRowModel().rows;

	if (rows.length === 0) {
		return (
			<div className="border border-dashed border-border bg-muted/20 px-6 py-10 text-center font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em] lg:hidden">
				{emptyMessage}
			</div>
		);
	}

	const leafColumns = table.getAllLeafColumns();
	const titleColumn = leafColumns.find(
		(column) => column.columnDef.meta?.mobileCard?.slot === "title",
	);
	const primaryColumnKey =
		cardPrimaryColumnId ?? (titleColumn ?? leafColumns[0])?.id ?? "";
	const hiddenIds = new Set(cardHiddenColumnIds ?? []);

	return (
		<div className="grid gap-2 lg:hidden">
			{rows.map((row) => {
				const {
					primaryCell,
					subtitleCells,
					eyebrowCells,
					badgeCells,
					footerCells,
					detailCells,
				} = bucketCardCells(row.getVisibleCells(), primaryColumnKey, hiddenIds);
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
														"font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]",
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
											const mobileCard = cell.column.columnDef.meta?.mobileCard;
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

						{primaryCell ||
						subtitleCells.length > 0 ||
						badgeCells.length > 0 ? (
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
								{subtitleCells.map((cell) => {
									const mobileCard = cell.column.columnDef.meta?.mobileCard;
									return (
										<div
											className={cn("min-w-0 text-sm", mobileCard?.className)}
											key={cell.id}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</div>
									);
								})}
								{badgeCells.length > 0 ? (
									<div className="flex flex-wrap items-center gap-1">
										{badgeCells.map((cell) => {
											const mobileCard = cell.column.columnDef.meta?.mobileCard;
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
													"font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]",
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
};
