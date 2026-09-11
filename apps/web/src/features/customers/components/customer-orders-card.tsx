import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeOrderAmount } from "@/features/customers/lib/order-amount";
import type { Order } from "@/lib/api";
import dayjs from "@/lib/dayjs";
import { ordersPageQueryOptions } from "@/lib/query-options";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

interface CustomerOrdersCardProps {
	customerId: number;
	onPageChange: (page: number) => void;
	page: number;
}

const OrderAmountCell = ({ order }: { order: Order }) => {
	const amount = describeOrderAmount(order);

	return (
		<div className="grid gap-0.5 text-right">
			<span
				className={cn(
					"font-mono text-sm tabular-nums",
					amount.isPending && "text-muted-foreground",
				)}
			>
				{amount.label}
			</span>
			{amount.refunded ? (
				<span className="font-mono text-[11px] text-destructive tabular-nums">
					{`refunded ${amount.refunded}`}
				</span>
			) : null}
		</div>
	);
};

export const CustomerOrdersCard = ({
	customerId,
	onPageChange,
	page,
}: CustomerOrdersCardProps) => {
	const ordersQuery = useQuery(
		ordersPageQueryOptions({
			customer_id: customerId,
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE,
		}),
	);
	const orders = ordersQuery.data?.items ?? [];

	const columns = useMemo<DataTableColumnDef<Order>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Code",
				cell: ({ row }) => (
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(row.original.id) }}
						className="font-mono font-semibold"
					>
						{row.original.code}
					</Link>
				),
			},
			{
				id: "date",
				header: "Date",
				cell: ({ row }) => (
					<span className="font-mono text-xs tabular-nums">
						{dayjs(row.original.created_at).format("DD MMM YYYY")}
					</span>
				),
			},
			{
				id: "store",
				header: "Store",
				cell: ({ row }) => row.original.store_name,
			},
			{
				id: "items",
				header: "Items",
				cell: ({ row }) => (
					<span className="font-mono tabular-nums">
						{row.original.fulfillment.total_count}
					</span>
				),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant={getOrderStatusBadgeVariant(row.original.status)}>
						{formatOrderStatus(row.original.status)}
					</Badge>
				),
			},
			{
				id: "paid",
				header: () => <span className="block text-right">Paid</span>,
				cell: ({ row }) => <OrderAmountCell order={row.original} />,
			},
		],
		[],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Orders</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<DataTable
					columns={columns}
					data={orders}
					isLoading={ordersQuery.isPending}
				/>
				<TablePagination
					meta={ordersQuery.data?.meta}
					isLoading={ordersQuery.isPending}
					onPageChange={onPageChange}
				/>
			</CardContent>
		</Card>
	);
};
