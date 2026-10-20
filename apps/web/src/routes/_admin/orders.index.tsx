import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	type LinkProps,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";
import { DataTable, WRAP_NAME_CLASS } from "@/components/data-table";
import type { DataTableColumnDef } from "@/components/data-table-features";
import { EmptyState } from "@/components/empty-state";
import { ListPanel } from "@/components/list-panel";
import { MoneyValue } from "@/components/money-value";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomerLink } from "@/features/customers/components/customer-link";
import {
	type FetchOrdersQuery,
	type Order,
	ordersQueries,
} from "@/features/orders/api";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import {
	NOTIFIED_VALUES,
	ORDER_STATUS_VALUES,
	OrderFilters,
	type OrderFilterValues,
	PAYMENT_STATUS_VALUES,
} from "@/features/orders/components/order-filters";
import { OrderPhoneRow } from "@/features/orders/components/order-phone-row";
import { OrderStatusTabs } from "@/features/orders/components/order-status-tabs";
import { PickupRadar } from "@/features/orders/components/pickup-radar";
import { useOrderSheet } from "@/features/orders/hooks/useOrderSheet";
import { getPaymentBadges } from "@/features/orders/lib/payment-badges";
import { storesQueries } from "@/features/stores/api";
import { usersQueries } from "@/features/users/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatListDate } from "@/lib/dayjs";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/stores/auth-store";
import { useSheet } from "@/stores/sheet-store";

const ordersSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	search: z.string().trim().min(1).max(100).optional().catch(undefined),
	storeId: z.coerce.number().int().positive().optional().catch(undefined),
	status: z.enum(ORDER_STATUS_VALUES).optional().catch(undefined),
	paymentStatus: z.enum(PAYMENT_STATUS_VALUES).optional().catch(undefined),
	notified: z.enum(NOTIFIED_VALUES).optional().catch(undefined),
	dateFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.catch(undefined),
	dateTo: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.catch(undefined),
	// The Order open in the sheet over the list, on a tablet or desktop.
	open: z.coerce.number().int().positive().optional().catch(undefined),
});

const PAGE_SIZE = 25;

interface ItemsReadyProps {
	ready: number;
	total: number;
}

// How many of the Order's pairs are finished, so the counter sees "2/3"
// before the customer asks whether everything is done.
const ItemsReady = ({ ready, total }: ItemsReadyProps) => {
	if (total === 0) {
		return <span className="text-muted-foreground">—</span>;
	}
	const isDone = ready === total;
	return (
		<div className="grid w-20 gap-1">
			<span className="text-subhead tabular-nums">{`${ready}/${total}`}</span>
			<span className="h-1.5 overflow-hidden rounded-full bg-soft-bar-track">
				<span
					className={cn(
						"block h-full rounded-full",
						isDone ? "bg-success" : "bg-primary",
					)}
					style={{ width: `${(ready / total) * 100}%` }}
				/>
			</span>
		</div>
	);
};

function buildOrdersListParams(
	filters: OrderFilterValues & { page: number },
	storeId?: number,
): FetchOrdersQuery {
	return {
		limit: PAGE_SIZE,
		offset: (filters.page - 1) * PAGE_SIZE,
		...(filters.search ? { search: filters.search } : {}),
		...(storeId !== undefined ? { store_id: storeId } : {}),
		...(filters.status ? { status: filters.status } : {}),
		...(filters.paymentStatus ? { payment_status: filters.paymentStatus } : {}),
		...(filters.notified ? { notified: filters.notified } : {}),
		...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
		...(filters.dateTo ? { date_to: filters.dateTo } : {}),
	};
}

export const Route = createFileRoute("/_admin/orders/")({
	validateSearch: (search) => ordersSearchSchema.parse(search),
	// Opening an Order in the sheet over the list must not re-run the list's loader.
	loaderDeps: ({ search: { open: _open, ...listSearch } }) => listSearch,
	loader: async ({ context, deps }) => {
		const ensureOrders = () =>
			context.queryClient.ensureQueryData(
				ordersQueries.list(buildOrdersListParams(deps, deps.storeId)),
			);

		await Promise.all([
			context.queryClient.ensureQueryData(storesQueries.list()),
			// A storeId in the URL already satisfies the fetch gate.
			deps.storeId !== undefined ? ensureOrders() : undefined,
		]);

		if (deps.storeId === undefined && context.me.role === "admin") {
			await ensureOrders();
		}
	},
	component: OrdersPage,
});

function OrdersPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const currentUser = getCurrentUser();
	const search = Route.useSearch();

	const storesQuery = useQuery(storesQueries.list());
	const meQuery = useQuery({
		...usersQueries.me(),
		enabled: !!currentUser,
	});

	const userStoreIds =
		meQuery.data?.userStores?.map((item) => item.store_id) ?? [];
	// DB-fresh role — JWT claim goes stale on mid-session role changes.
	const role = meQuery.data?.role;

	// A phone opens an Order as its own page; a tablet or desktop opens it in a
	// sheet over the list.
	const isWide = !useIsMobile();
	const sheetOrderId = isWide ? search.open : undefined;
	// Replace, not push: walking twenty Orders with J must not leave twenty
	// steps for Back to undo before it leaves the page.
	const handleOpenOrder = useCallback(
		(orderId: number) => {
			void navigate({
				search: (prev) => ({ ...prev, open: orderId }),
				replace: true,
			});
		},
		[navigate],
	);
	const orderLink = useCallback(
		(orderId: number): LinkProps =>
			isWide
				? {
						from: Route.fullPath,
						search: (prev) => ({ ...prev, open: orderId }),
						replace: true,
					}
				: { to: "/orders/$orderId", params: { orderId: String(orderId) } },
		[isWide],
	);
	const handleCloseOrder = useCallback(() => {
		void navigate({
			search: (prev) => ({ ...prev, open: undefined }),
			replace: true,
		});
	}, [navigate]);

	useEffect(() => {
		if (!currentUser || search.storeId !== undefined) {
			return;
		}

		if (role === "admin") {
			return;
		}

		if (userStoreIds.length > 0) {
			void navigate({
				search: (prev) => ({
					...prev,
					page: prev.page ?? 1,
					storeId: userStoreIds[0],
				}),
				replace: true,
			});
		}
	}, [currentUser, navigate, role, search.storeId, userStoreIds]);

	const handleFilterChange = useCallback(
		(patch: Partial<OrderFilterValues>) => {
			void navigate({
				search: (prev) => ({ ...prev, page: 1, ...patch }),
			});
		},
		[navigate],
	);

	const parsedStoreId = search.storeId;
	// Admin and non-admin build the same params once a store is chosen; the only
	// gap — non-admin with no store — never runs (gated by `enabled` below).
	const orderQuery =
		role !== "admin" && parsedStoreId === undefined
			? undefined
			: buildOrdersListParams(search, parsedStoreId);

	const canListOrders = role === "admin" ? true : parsedStoreId !== undefined;

	const ordersQuery = useQuery({
		...ordersQueries.list(orderQuery),
		enabled: canListOrders,
	});

	// The same filters minus status and paging, so each tab shows what picking
	// it would list.
	const statusCountsQuery = useQuery({
		...ordersQueries.statusCounts(
			orderQuery && {
				search: orderQuery.search,
				store_id: orderQuery.store_id,
				payment_status: orderQuery.payment_status,
				notified: orderQuery.notified,
				date_from: orderQuery.date_from,
				date_to: orderQuery.date_to,
			},
		),
		enabled: canListOrders,
	});

	const hasNoStoreAssignment =
		role !== "admin" && meQuery.isSuccess && userStoreIds.length === 0;

	const openSheet = useSheet((state) => state.openSheet);

	const orders = ordersQuery.data?.items ?? [];

	useOrderSheet({
		isReady: ordersQuery.data !== undefined,
		onClose: handleCloseOrder,
		onSelect: handleOpenOrder,
		openId: sheetOrderId,
		orders,
	});

	const handleOpenPickupRadar = useCallback(() => {
		openSheet({
			title: "Ready for pickup",
			description: "Orders that can leave the store now.",
			content: () => (
				<PickupRadar enabled={canListOrders} storeId={parsedStoreId} />
			),
		});
	}, [canListOrders, openSheet, parsedStoreId]);

	const columns = useMemo<DataTableColumnDef<Order>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Order code",
				cell: ({ row }) => (
					<div className="flex flex-col gap-0.5">
						<div className="flex gap-x-1">
							{row.original.has_complaint ? (
								<span className="text-destructive text-footnote">
									COMPLAINT
								</span>
							) : null}
							<Link
								{...orderLink(row.original.id)}
								className="font-medium tabular-nums"
							>
								{row.original.code}
							</Link>
						</div>
						<span className="font-normal text-caption text-muted-foreground">
							{row.original.store_name}
						</span>
					</div>
				),
			},
			{
				id: "created_at",
				header: "Created at",
				cell: ({ row }) => (
					<span className="whitespace-nowrap tabular-nums">
						{formatListDate(row.original.created_at)}
					</span>
				),
			},
			{
				accessorKey: "customer_name",
				header: "Customer",
				cell: ({ row }) => (
					<div className={WRAP_NAME_CLASS}>
						<span className="flex items-baseline gap-x-1.5">
							<CustomerLink
								className="min-w-0"
								customerId={row.original.customer_id}
								name={row.original.customer_name}
							/>
							{row.original.notified ? (
								<NotifiedLabel className="shrink-0" />
							) : null}
						</span>
						<span className="block whitespace-nowrap text-muted-foreground text-footnote tabular-nums">
							{row.original.customer_phone}
						</span>
					</div>
				),
			},
			{
				id: "items_ready",
				header: "Items ready",
				cell: ({ row }) => (
					<ItemsReady
						ready={row.original.items_ready}
						total={row.original.items_total}
					/>
				),
			},
			{
				accessorKey: "status",
				header: "Fulfillment",
				cell: ({ row }) => (
					<Badge variant={getOrderStatusBadgeVariant(row.original.status)}>
						{formatOrderStatus(row.original.status)}
					</Badge>
				),
			},
			{
				accessorKey: "payment_status",
				header: "Payment",
				cell: ({ row }) => (
					<div className="flex flex-wrap gap-1">
						{getPaymentBadges(row.original).map((badge) => (
							<Badge key={badge.label} variant={badge.variant}>
								{badge.label}
							</Badge>
						))}
					</div>
				),
			},
			{
				id: "total",
				header: "Total",
				meta: { align: "right" },
				cell: ({ row }) => <MoneyValue value={row.original.total} />,
			},
		],
		[orderLink],
	);

	const pager = (
		<TablePagination
			meta={ordersQuery.data?.meta}
			isLoading={ordersQuery.isPending}
			onPageChange={(page) => {
				void navigate({
					search: (prev) => ({
						...prev,
						page,
					}),
				});
			}}
		/>
	);

	return (
		<>
			<PageHeader
				title="Orders"
				actions={
					<Button
						variant="outline"
						onClick={handleOpenPickupRadar}
						icon={<CrosshairSimpleIcon className="size-4" />}
					>
						Ready for pickup
					</Button>
				}
			/>
			<ListPanel>
				<OrderStatusTabs
					value={search.status}
					counts={statusCountsQuery.data}
					onValueChange={(status) => handleFilterChange({ status })}
				/>
				<OrderFilters
					values={search}
					role={role}
					userStoreIds={userStoreIds}
					onChange={handleFilterChange}
				/>
				{hasNoStoreAssignment ? (
					<EmptyState>No store assigned</EmptyState>
				) : (
					<DataTable
						columns={columns}
						data={orders}
						isLoading={ordersQuery.isPending || storesQuery.isPending}
						getRowLink={(order) => orderLink(order.id)}
						isRowActive={(order) => order.id === sheetOrderId}
						renderCard={(order) => (
							<OrderPhoneRow
								isActive={order.id === sheetOrderId}
								link={orderLink(order.id)}
								order={order}
							/>
						)}
						footer={pager}
					/>
				)}
			</ListPanel>
		</>
	);
}
