import { CaretRightIcon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import {
	type Cell,
	flexRender,
	type RowData,
	type Table as TanstackTable,
} from "@tanstack/react-table";
import { Fragment, type ReactNode } from "react";
import type { DataTableFeatures } from "@/components/data-table-features";
import "@/components/data-table-meta";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTENT_FADE, staleFade } from "@/lib/content-fade";
import { cn } from "@/lib/utils";

// Enough to fill a phone screen, so the list doesn't grow under the thumb when rows land.
const SKELETON_CARD_COUNT = 8;

interface DataTableCardsProps<TData extends RowData> {
	table: TanstackTable<DataTableFeatures, TData>;
	isLoading?: boolean;
	isStale?: boolean;
	resultSet?: string;
	skeletonRowCount?: number;
	skeletonCardClassName?: string;
	emptyMessage: string;
	cardPrimaryColumnId?: string;
	cardHiddenColumnIds?: string[];
	getCardLink?: (row: TData) => LinkProps;
	isRowActive?: (row: TData) => boolean;
	isGrouped?: boolean;
	renderCard?: (row: TData) => ReactNode;
}

const GROUPED_ROW_CLASS =
	"not-first:before:pointer-events-none not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:border-border not-first:before:border-t";

interface CardCells<TData extends RowData> {
	primaryCell?: Cell<DataTableFeatures, TData>;
	titleEndCells: Cell<DataTableFeatures, TData>[];
	subtitleCells: Cell<DataTableFeatures, TData>[];
	eyebrowCells: Cell<DataTableFeatures, TData>[];
	badgeCells: Cell<DataTableFeatures, TData>[];
	statusCells: Cell<DataTableFeatures, TData>[];
	footerCells: Cell<DataTableFeatures, TData>[];
	detailCells: Cell<DataTableFeatures, TData>[];
}

const getCellHeaderLabel = <TData extends RowData>(
	cell: Cell<DataTableFeatures, TData>,
): ReactNode => {
	const mobileCard = cell.column.columnDef.meta?.mobileCard;
	if (mobileCard?.label) {
		return mobileCard.label;
	}
	const headerDef = cell.column.columnDef.header;
	return typeof headerDef === "string" ? headerDef : cell.column.id;
};

const bucketCardCells = <TData extends RowData>(
	cells: Cell<DataTableFeatures, TData>[],
	primaryColumnKey: string,
	hiddenIds: Set<string>,
): CardCells<TData> => {
	const buckets: CardCells<TData> = {
		titleEndCells: [],
		subtitleCells: [],
		eyebrowCells: [],
		badgeCells: [],
		statusCells: [],
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
		const mobileCard = cell.column.columnDef.meta?.mobileCard;
		if (mobileCard?.omitWhenEmpty) {
			const value = cell.getValue();
			if (value === null || value === "") {
				continue;
			}
		}
		const slot = mobileCard?.slot;
		if (slot === "title-end") {
			buckets.titleEndCells.push(cell);
			continue;
		}
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
		if (slot === "status") {
			buckets.statusCells.push(cell);
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
	isStale,
	resultSet,
	skeletonRowCount = SKELETON_CARD_COUNT,
	skeletonCardClassName,
	emptyMessage,
	cardPrimaryColumnId,
	cardHiddenColumnIds,
	getCardLink,
	isRowActive,
	isGrouped,
	renderCard,
}: DataTableCardsProps<TData>) => {
	if (isLoading) {
		return (
			<div
				aria-hidden
				className={cn(
					"grid gap-2 lg:hidden",
					isGrouped && "gap-0 overflow-hidden rounded-lg border bg-card",
				)}
			>
				{Array.from({ length: skeletonRowCount }, (_, index) =>
					isGrouped ? (
						// A grouped row is a name over a code line, like an Order row.
						<div
							key={index}
							className={cn(
								"relative grid content-start gap-0.5 px-4 py-3",
								GROUPED_ROW_CLASS,
								skeletonCardClassName,
							)}
						>
							<Skeleton className="my-0.5 h-4 w-2/3" />
							<Skeleton className="my-0.5 h-3.5 w-1/3" />
						</div>
					) : (
						<div
							key={index}
							className={cn(
								"relative grid h-32 grid-rows-[auto_1fr_auto] gap-3 overflow-hidden rounded-lg border bg-card p-3",
								skeletonCardClassName,
							)}
						>
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-5 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
						</div>
					),
				)}
			</div>
		);
	}

	const rows = table.getRowModel().rows;

	if (rows.length === 0) {
		return (
			<EmptyState
				className={cn(
					"rounded-lg border bg-card text-body text-foreground lg:hidden",
					CONTENT_FADE,
				)}
			>
				{emptyMessage}
			</EmptyState>
		);
	}

	if (renderCard) {
		return (
			<ul
				key={resultSet}
				className={cn(
					"divide-y divide-border overflow-hidden rounded-lg border bg-card lg:hidden",
					CONTENT_FADE,
					staleFade(isStale),
				)}
			>
				{rows.map((row) => (
					<li key={row.id}>{renderCard(row.original)}</li>
				))}
			</ul>
		);
	}

	const leafColumns = table.getAllLeafColumns();
	const titleColumn = leafColumns.find(
		(column) => column.columnDef.meta?.mobileCard?.slot === "title",
	);
	const primaryColumnKey =
		cardPrimaryColumnId ?? (titleColumn ?? leafColumns[0])?.id ?? "";
	const hiddenIds = new Set(cardHiddenColumnIds ?? []);
	// Links and buttons inside the card sit above the whole-card link, so the
	// customer name on an order card still opens the Customer.
	const raisedControls = getCardLink && "[&_a]:relative [&_button]:relative";
	const hasCaret = isGrouped && getCardLink !== undefined;
	const rowPadding = isGrouped ? "px-4" : "px-3";

	return (
		// grid-cols-1 on each grid here caps it at the screen's width, so a long
		// description or name truncates instead of pushing Edit off the edge.
		<div
			key={resultSet}
			className={cn(
				"grid grid-cols-1 gap-2 lg:hidden",
				isGrouped && "gap-0 overflow-hidden rounded-lg border bg-card",
				CONTENT_FADE,
				staleFade(isStale),
			)}
		>
			{rows.map((row) => {
				const {
					primaryCell,
					titleEndCells,
					subtitleCells,
					eyebrowCells,
					badgeCells,
					statusCells,
					footerCells,
					detailCells,
				} = bucketCardCells(row.getAllCells(), primaryColumnKey, hiddenIds);
				const primaryConfig = primaryCell?.column.columnDef.meta?.mobileCard;
				const hasHeaderStrip =
					eyebrowCells.length > 0 || footerCells.length > 0;
				const status = statusCells.length > 0 && (
					<div className="ml-auto flex min-w-0 flex-wrap justify-end gap-1">
						{statusCells.map((cell) => (
							<Fragment key={cell.id}>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</Fragment>
						))}
					</div>
				);
				const hasBadgeRow = badgeCells.length > 0;
				// A User card is name over "handle · role · stores", so an Inactive
				// badge ends that second line instead of adding a third.
				const isStatusOnSubtitle =
					!hasBadgeRow && detailCells.length === 0 && subtitleCells.length > 0;

				return (
					<article
						key={row.id}
						data-state={isRowActive?.(row.original) ? "selected" : undefined}
						className={cn(
							"group/card relative grid grid-cols-1 overflow-hidden bg-card text-body transition-colors hover:bg-muted/20",
							isGrouped
								? cn("data-[state=selected]:bg-primary/10", GROUPED_ROW_CLASS)
								: "rounded-lg border data-[state=selected]:bg-primary/[0.06] data-[state=selected]:ring-2! data-[state=selected]:ring-primary",
							hasCaret && "grid-cols-[minmax(0,1fr)_auto]",
						)}
					>
						{getCardLink !== undefined && (
							<Link
								{...getCardLink(row.original)}
								aria-hidden
								tabIndex={-1}
								preload={false}
								className="absolute inset-0"
							/>
						)}
						{hasHeaderStrip ? (
							<div
								className={cn(
									"col-start-1 flex items-center justify-between gap-3 border-border/70 border-b py-1.5",
									rowPadding,
									raisedControls,
								)}
							>
								<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
									{eyebrowCells.map((cell, index) => {
										const mobileCard = cell.column.columnDef.meta?.mobileCard;
										return (
											<Fragment key={cell.id}>
												{index > 0 ? (
													<span
														aria-hidden="true"
														className="text-caption text-border"
													>
														/
													</span>
												) : null}
												<span
													className={cn(
														"font-medium text-muted-foreground text-footnote",
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
														"font-semibold text-foreground text-body tabular-nums",
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

						<div
							className={cn(
								"col-start-1 grid grid-cols-1 gap-2 py-2.5",
								rowPadding,
								raisedControls,
							)}
						>
							{primaryCell || titleEndCells.length > 0 ? (
								// No wrap: a long Service name wraps beside Edit instead of
								// pushing Edit down onto a second line of its own.
								<div className="flex items-start justify-between gap-3">
									{primaryCell ? (
										<div
											className={cn(
												"min-w-0 flex-1 wrap-break-word font-medium text-headline text-foreground leading-tight tracking-tight",
												// Centres the first line on the Edit button beside it.
												titleEndCells.length > 0 && "pt-1",
												primaryConfig?.className,
											)}
										>
											{flexRender(
												primaryCell.column.columnDef.cell,
												primaryCell.getContext(),
											)}
										</div>
									) : null}
									{titleEndCells.length > 0 ? (
										<div className="ml-auto flex shrink-0 items-center gap-2">
											{titleEndCells.map((cell) => (
												<div
													key={cell.id}
													className={
														cell.column.columnDef.meta?.mobileCard?.className
													}
												>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</div>
											))}
										</div>
									) : null}
								</div>
							) : null}
							{subtitleCells.length > 0 ? (
								<div className="flex items-center justify-between gap-3">
									<div className="flex min-w-0 flex-wrap items-center gap-x-1.5 wrap-break-word text-muted-foreground text-body">
										{subtitleCells.map((cell, index) => {
											const mobileCard = cell.column.columnDef.meta?.mobileCard;
											return (
												<Fragment key={cell.id}>
													{index > 0 ? (
														<span
															aria-hidden="true"
															className="text-muted-foreground"
														>
															·
														</span>
													) : null}
													<div className={cn("min-w-0", mobileCard?.className)}>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext(),
														)}
													</div>
												</Fragment>
											);
										})}
									</div>
									{isStatusOnSubtitle ? status : null}
								</div>
							) : null}
							{detailCells.length > 0 ? (
								// Label and value side by side, wrapping as the line fills,
								// so a catalog card is a few lines tall, not a grid of boxes.
								<div className="flex items-end justify-between gap-3">
									<dl className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
										{detailCells.map((cell) => {
											const mobileCard = cell.column.columnDef.meta?.mobileCard;
											return (
												<div
													key={cell.id}
													className={cn(
														"flex min-w-0 items-center gap-1.5",
														mobileCard?.className,
													)}
												>
													<dt
														className={cn(
															"text-muted-foreground text-footnote",
															mobileCard?.labelClassName,
														)}
													>
														{getCellHeaderLabel(cell)}
													</dt>
													<dd
														className={cn(
															"min-w-0 truncate font-medium text-foreground text-body",
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
									{!hasBadgeRow && status}
								</div>
							) : null}
							{hasBadgeRow ? (
								// Wraps, so an Order's three status badges drop under its
								// fixed-width Items ready bar instead of overlapping it.
								<div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
									<div className="flex min-w-0 flex-wrap items-center gap-1">
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
									{status}
								</div>
							) : null}
							{!(hasBadgeRow || isStatusOnSubtitle) &&
								detailCells.length === 0 &&
								status}
						</div>
						{hasCaret ? (
							<CaretRightIcon
								aria-hidden
								className="col-start-2 row-span-2 row-start-1 mr-4 size-3.5 self-center text-muted-foreground/50"
							/>
						) : null}
					</article>
				);
			})}
		</div>
	);
};
