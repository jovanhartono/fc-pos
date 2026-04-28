import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { agingQueueQueryOptions } from "@/lib/query-options";
import {
	formatOrderServiceStatus,
	getOrderServiceStatusBadgeVariant,
} from "@/lib/status";
import { cn } from "@/lib/utils";

interface AgingQueuePanelProps {
	storeId?: number;
}

const PAGE_SIZE = 50;

export const AgingQueuePanel = ({ storeId }: AgingQueuePanelProps) => {
	const [offset, setOffset] = useState(0);
	const query = useQuery(
		agingQueueQueryOptions({ store_id: storeId, limit: PAGE_SIZE, offset }),
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
			<div className="overflow-x-auto border border-border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item code</TableHead>
							<TableHead>Service</TableHead>
							<TableHead>Store</TableHead>
							<TableHead className="text-right">Days waiting</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Handler</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((row) => (
							<TableRow key={row.id}>
								<TableCell className="font-mono">
									<Link
										to="/orders/$orderId"
										params={{ orderId: String(row.order_id) }}
										className="underline-offset-4 hover:underline"
									>
										{row.item_code ?? `#${row.id}`}
									</Link>
								</TableCell>
								<TableCell>{row.service_name}</TableCell>
								<TableCell className="font-mono text-xs">
									{row.store_code} · {row.store_name}
								</TableCell>
								<TableCell
									className={cn(
										"text-right font-mono tabular-nums",
										row.days_waiting >= 14 && "text-destructive",
									)}
								>
									{row.days_waiting}
								</TableCell>
								<TableCell>
									<Badge
										variant={getOrderServiceStatusBadgeVariant(row.status)}
									>
										{formatOrderServiceStatus(row.status)}
									</Badge>
								</TableCell>
								<TableCell>{row.handler_name ?? "Unassigned"}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
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
