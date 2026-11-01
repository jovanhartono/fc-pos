import { Task01Icon } from "@hugeicons/core-free-icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { TextSkeleton } from "@/components/text-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type AgingQueueItem, reportsQueries } from "@/features/reports/api";
import { ItemCodeLink } from "@/features/reports/components/item-code-link";
import { CONTENT_FADE } from "@/lib/content-fade";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";

interface AgingQueuePanelProps {
	storeId?: number;
}

const PAGE_SIZE = 50;

const columns: DataTableColumnDef<AgingQueueItem>[] = [
	{
		id: "item_code",
		header: "Item code",
		meta: { width: { percent: 17, minRem: 8 }, mobileCard: { slot: "title" } },
		cell: ({ row }) => (
			<ItemCodeLink orderId={row.original.order_id}>
				{row.original.item_code ?? `#${row.original.id}`}
			</ItemCodeLink>
		),
	},
	{
		accessorKey: "service_name",
		header: "Service",
		meta: {
			kind: "text",
			width: { percent: 24, minRem: 8 },
			mobileCard: { slot: "subtitle" },
		},
	},
	{
		id: "store",
		header: "Store",
		meta: {
			width: { percent: 17, minRem: 8 },
			mobileCard: { slot: "eyebrow" },
		},
		cell: ({ row }) => (
			<span className="text-footnote">
				{row.original.store_code} · {row.original.store_name}
			</span>
		),
	},
	{
		accessorKey: "days_waiting",
		header: "Days waiting",
		meta: {
			width: { percent: 11, minRem: 6.25 },
			headerClassName: "text-right",
			cellClassName: "text-right",
		},
		cell: ({ row }) => (
			<span
				className={cn(
					"tabular-nums",
					row.original.days_waiting >= 14 && "text-destructive",
				)}
			>
				{row.original.days_waiting}
			</span>
		),
	},
	{
		id: "status",
		header: "Status",
		meta: {
			width: { percent: 14, minRem: 8 },
			mobileCard: { slot: "badges" },
		},
		cell: ({ row }) => (
			<Badge variant={getOrderServiceStatusBadgeVariant(row.original.status)}>
				{formatOrderServiceStatus(row.original.status)}
			</Badge>
		),
	},
	{
		accessorKey: "handler_name",
		header: "Handler",
		meta: { kind: "text", width: { percent: 17, minRem: 7 } },
		cell: ({ row }) => row.original.handler_name ?? "Unassigned",
	},
];

export const AgingQueuePanel = ({ storeId }: AgingQueuePanelProps) => {
	const [offset, setOffset] = useState(0);
	const listTopRef = useRef<HTMLDivElement>(null);
	const query = useQuery({
		...reportsQueries.agingQueue({
			store_id: storeId,
			limit: PAGE_SIZE,
			offset,
		}),
		placeholderData: keepPreviousData,
	});

	const items = query.data?.items ?? [];
	const total = query.data?.meta.total ?? 0;
	const isBusy = query.isPending || query.isPlaceholderData;
	const hasNext = !isBusy && offset + items.length < total;
	const hasPrev = !isBusy && offset > 0;

	// The admin paging from the bottom of 50 rows lands at the top of the
	// last page, faded, and the next page fills those same rows.
	const goTo = (nextOffset: number) => {
		setOffset(nextOffset);
		listTopRef.current?.scrollIntoView({ block: "start" });
	};

	if (!query.isPending && total === 0) {
		return (
			<div
				className={cn(
					"rounded-lg border bg-card p-8 text-center text-body text-muted-foreground",
					CONTENT_FADE,
				)}
			>
				Nothing waiting. Queue is clear.
			</div>
		);
	}

	return (
		<div className="grid scroll-mt-4 gap-4" ref={listTopRef}>
			<div className="flex items-center justify-between gap-3">
				<p className="text-body text-muted-foreground">
					{query.isPending ? (
						<TextSkeleton className="w-64" />
					) : (
						`${pluralize(total, "item")} not yet picked up — oldest first.`
					)}
				</p>
			</div>
			<div className="lg:overflow-hidden lg:rounded-lg lg:bg-card">
				<DataTable
					emptyIcon={Task01Icon}
					columns={columns}
					data={items}
					isLoading={query.isPending}
					isStale={query.isPlaceholderData}
					filterKey={`${storeId}:${offset}`}
					// A full page, like most Stores have waiting, so the pager
					// starts where it ends up.
					skeletonRowCount={PAGE_SIZE}
					getRowLink={(item) => ({
						to: "/orders/$orderId",
						params: { orderId: String(item.order_id) },
					})}
				/>
			</div>
			<div className="flex items-center justify-between gap-3">
				<p className="text-footnote text-muted-foreground tabular-nums">
					{query.isPending
						? "–"
						: `Showing ${offset + 1}–${offset + items.length} of ${total}`}
				</p>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!hasPrev}
						onClick={() => goTo(Math.max(0, offset - PAGE_SIZE))}
					>
						Previous
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!hasNext}
						onClick={() => goTo(offset + PAGE_SIZE)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
};
