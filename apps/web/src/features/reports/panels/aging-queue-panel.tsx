import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type AgingQueueItem, reportsQueries } from "@/features/reports/api";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";

interface AgingQueuePanelProps {
	storeId?: number;
}

const PAGE_SIZE = 50;

const columns: DataTableColumnDef<AgingQueueItem>[] = [
	{
		id: "item_code",
		header: "Item code",
		meta: { mobileCard: { slot: "title" } },
		cell: ({ row }) => (
			<Link
				to="/orders/$orderId"
				params={{ orderId: String(row.original.order_id) }}
				className="font-mono underline-offset-4 hover:underline"
			>
				{row.original.item_code ?? `#${row.original.id}`}
			</Link>
		),
	},
	{
		accessorKey: "service_name",
		header: "Service",
		meta: { mobileCard: { slot: "subtitle" } },
	},
	{
		id: "store",
		header: "Store",
		meta: { mobileCard: { slot: "eyebrow" } },
		cell: ({ row }) => (
			<span className="font-mono text-xs">
				{row.original.store_code} · {row.original.store_name}
			</span>
		),
	},
	{
		accessorKey: "days_waiting",
		header: "Days waiting",
		meta: { headerClassName: "text-right", cellClassName: "text-right" },
		cell: ({ row }) => (
			<span
				className={cn(
					"font-mono tabular-nums",
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
		meta: { mobileCard: { slot: "badges" } },
		cell: ({ row }) => (
			<Badge variant={getOrderServiceStatusBadgeVariant(row.original.status)}>
				{formatOrderServiceStatus(row.original.status)}
			</Badge>
		),
	},
	{
		id: "handler",
		header: "Handler",
		cell: ({ row }) => row.original.handler_name ?? "Unassigned",
	},
];

export const AgingQueuePanel = ({ storeId }: AgingQueuePanelProps) => {
	const [offset, setOffset] = useState(0);
	const query = useQuery(
		reportsQueries.agingQueue({ store_id: storeId, limit: PAGE_SIZE, offset }),
	);

	const items = query.data?.items ?? [];
	const total = query.data?.meta.total ?? 0;
	const hasNext = offset + items.length < total;
	const hasPrev = offset > 0;

	if (query.isPending) {
		return (
			<div className="grid gap-2">
				{Array.from({ length: 6 }, (_, index) => (
					<div
						key={index}
						className="h-12 animate-pulse border border-border bg-muted/40"
					/>
				))}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
				Nothing waiting. Queue is clear.
			</div>
		);
	}

	return (
		<div className="grid gap-4">
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					{total} item{total === 1 ? "" : "s"} not yet picked up — oldest first.
				</p>
			</div>
			<div className="lg:border lg:border-border">
				<DataTable
					columns={columns}
					data={items}
					getCardLink={(item) => ({
						to: "/orders/$orderId",
						params: { orderId: String(item.order_id) },
					})}
				/>
			</div>
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs text-muted-foreground">
					Showing {offset + 1}–{offset + items.length} of {total}
				</p>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!hasPrev}
						onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
					>
						Previous
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={!hasNext}
						onClick={() => setOffset(offset + PAGE_SIZE)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
};

export default AgingQueuePanel;
