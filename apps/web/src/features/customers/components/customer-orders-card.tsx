import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DataTable } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { MoneyValue } from "@/components/money-value";
import { SectionTitle } from "@/components/section";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { describeOrderAmount } from "@/features/customers/lib/order-amount";
import { type Order, ordersQueries } from "@/features/orders/api";
import { formatListDate } from "@/lib/dayjs";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";

// The route loader prefetches with this same size — two copies that drift
// would leave the page fetching twice and flashing a skeleton it already had.
export const CUSTOMER_ORDERS_PAGE_SIZE = 10;

interface CustomerOrdersCardProps {
	customerId: number;
	onPageChange: (page: number) => void;
	page: number;
}

const OrderAmountCell = ({ order }: { order: Order }) => {
	const amount = describeOrderAmount(order);

	return (
		<div className="grid gap-0.5 text-right">
			{amount.net === null ? (
				<span className="text-muted-foreground text-body">{amount.label}</span>
			) : (
				<MoneyValue className="text-body" value={amount.net} />
			)}
			{amount.refunded ? (
				<span className="text-caption text-destructive tabular-nums">
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
	const ordersQuery = useQuery({
		...ordersQueries.list({
			customer_id: customerId,
			limit: CUSTOMER_ORDERS_PAGE_SIZE,
			offset: (page - 1) * CUSTOMER_ORDERS_PAGE_SIZE,
		}),
		// The last page stays up, faded, until the next one lands.
		placeholderData: keepPreviousData,
	});
	const orders = ordersQuery.data?.items ?? [];

	const columns = useMemo<DataTableColumnDef<Order>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Code",
				meta: {
					width: { percent: 17, minRem: 9.25 },
					mobileCard: { slot: "title" },
				},
				cell: ({ row }) => (
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(row.original.id) }}
						className="font-medium tabular-nums"
					>
						{row.original.code}
					</Link>
				),
			},
			{
				id: "date",
				header: "Date",
				meta: {
					width: { percent: 13, minRem: 6.5 },
					mobileCard: { slot: "eyebrow" },
				},
				cell: ({ row }) => (
					<span className="whitespace-nowrap tabular-nums">
						{formatListDate(row.original.created_at)}
					</span>
				),
			},
			{
				id: "store",
				header: "Store",
				meta: { width: { percent: 26, minRem: 6.5 } },
				cell: ({ row }) => row.original.store_name,
			},
			{
				id: "items",
				header: "Items",
				meta: { width: { percent: 9, minRem: 3.5 } },
				cell: ({ row }) => (
					<span className="tabular-nums">
						{row.original.fulfillment.total_count}
					</span>
				),
			},
			{
				id: "status",
				header: "Status",
				meta: {
					width: { percent: 18, minRem: 8.25 },
					mobileCard: { slot: "badges" },
				},
				cell: ({ row }) => (
					<Badge variant={getOrderStatusBadgeVariant(row.original.status)}>
						{formatOrderStatus(row.original.status)}
					</Badge>
				),
			},
			{
				id: "paid",
				header: () => <span className="block text-right">Paid</span>,
				meta: {
					width: { percent: 17, minRem: 6.5 },
					mobileCard: { slot: "footer" },
				},
				cell: ({ row }) => <OrderAmountCell order={row.original} />,
			},
		],
		[],
	);

	return (
		<section className="flex min-h-0 flex-1 flex-col gap-3">
			<SectionTitle title="Orders" />
			<DataTable
				columns={columns}
				data={orders}
				isLoading={ordersQuery.isPending}
				isStale={ordersQuery.isPlaceholderData}
				filterKey={String(page)}
				skeletonLines={1}
				getRowLink={(order) => ({
					to: "/orders/$orderId",
					params: { orderId: String(order.id) },
				})}
				footer={
					<TablePagination
						meta={ordersQuery.data?.meta}
						isLoading={ordersQuery.isPending}
						onPageChange={onPageChange}
					/>
				}
			/>
		</section>
	);
};
