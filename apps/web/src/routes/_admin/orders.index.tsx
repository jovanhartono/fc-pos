import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	ORDER_STATUS_VALUES,
	OrderFilters,
	type OrderFilterValues,
	PAYMENT_STATUS_VALUES,
} from "@/features/orders/components/order-filters";
import { PickupRadar } from "@/features/orders/components/pickup-radar";
import type { FetchOrdersQuery, Order } from "@/lib/api";
import {
	meQueryOptions,
	ordersPageQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import {
	formatOrderStatus,
	formatPaymentStatus,
	formatRefundStatus,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
	getRefundStatusBadgeVariant,
} from "@/lib/status";
import { formatIDRCurrency } from "@/shared/utils";
import { getCurrentUser } from "@/stores/auth-store";
import { useSheet } from "@/stores/sheet-store";

const ordersSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	search: z.string().trim().min(1).max(100).optional().catch(undefined),
	storeId: z.coerce.number().int().positive().optional().catch(undefined),
	status: z.enum(ORDER_STATUS_VALUES).optional().catch(undefined),
	paymentStatus: z.enum(PAYMENT_STATUS_VALUES).optional().catch(undefined),
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
});

const PAGE_SIZE = 25;

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
		...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
		...(filters.dateTo ? { date_to: filters.dateTo } : {}),
	};
}

export const Route = createFileRoute("/_admin/orders/")({
	validateSearch: (search) => ordersSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const currentUser = getCurrentUser();
		await context.queryClient.ensureQueryData(storesQueryOptions());

		// DB-fresh role — JWT claim goes stale on mid-session role changes.
		const me = currentUser
			? await context.queryClient.ensureQueryData(meQueryOptions())
			: undefined;

		if (me?.role === "admin" || deps.storeId !== undefined) {
			await context.queryClient.ensureQueryData(
				ordersPageQueryOptions(buildOrdersListParams(deps, deps.storeId)),
			);
		}
	},
	component: OrdersPage,
});

function OrdersPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const currentUser = getCurrentUser();
	const search = Route.useSearch();

	const storesQuery = useQuery(storesQueryOptions());
	const meQuery = useQuery({
		...meQueryOptions(),
		enabled: !!currentUser,
	});

	const userStoreIds =
		meQuery.data?.userStores?.map((item) => item.store_id) ?? [];
	// DB-fresh role — JWT claim goes stale on mid-session role changes.
	const role = meQuery.data?.role;

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

	const ordersQuery = useQuery({
		...ordersPageQueryOptions(orderQuery),
		enabled: role === "admin" ? true : parsedStoreId !== undefined,
	});

	const hasNoStoreAssignment =
		role !== "admin" && meQuery.isSuccess && userStoreIds.length === 0;

	const openSheet = useSheet((state) => state.openSheet);

	const orders = ordersQuery.data?.items ?? [];

	const handleOpenPickupRadar = useCallback(() => {
		openSheet({
			title: "Pickup Radar",
			description: "Orders that can leave the store now.",
			content: () => <PickupRadar orders={orders} />,
		});
	}, [openSheet, orders]);

	const columns = useMemo<ColumnDef<Order>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Order Code",
				meta: {
					mobileCard: {
						slot: "title",
					},
				},
				cell: ({ row }) => (
					<div className="flex flex-col gap-0.5">
						<Link
							to="/orders/$orderId"
							params={{ orderId: String(row.original.id) }}
							className="font-mono font-semibold"
						>
							{row.original.code}
						</Link>
						<span className="font-mono font-normal text-[11px] text-muted-foreground tabular-nums">
							{row.original.store_name}
						</span>
					</div>
				),
			},
			{
				id: "store",
				header: "Store",
				meta: {
					mobileCard: {
						slot: "eyebrow",
					},
				},
				cell: ({ row }) => (
					<span>{dayjs(row.original.created_at).format("DD MMM HH:mm")}</span>
				),
			},
			{
				accessorKey: "customer_name",
				header: "Customer",
				meta: {
					mobileCard: {
						label: "Customer",
						className: "col-span-2",
						valueClassName: "truncate",
					},
				},
			},
			{
				accessorKey: "status",
				header: "Fulfillment",
				meta: {
					mobileCard: {
						slot: "badges",
					},
				},
				cell: ({ row }) => (
					<Badge variant={getOrderStatusBadgeVariant(row.original.status)}>
						{formatOrderStatus(row.original.status)}
					</Badge>
				),
			},
			{
				accessorKey: "payment_status",
				header: "Payment",
				meta: {
					mobileCard: {
						slot: "badges",
					},
				},
				cell: ({ row }) => (
					<div className="flex flex-wrap gap-1">
						<Badge
							variant={getPaymentStatusBadgeVariant(
								row.original.payment_status,
							)}
						>
							{formatPaymentStatus(row.original.payment_status)}
						</Badge>
						{row.original.refund_status !== "none" && (
							<Badge
								variant={getRefundStatusBadgeVariant(
									row.original.refund_status,
								)}
							>
								{formatRefundStatus(row.original.refund_status)}
							</Badge>
						)}
					</div>
				),
			},
			{
				id: "total",
				header: () => <div className="text-right">Total</div>,
				meta: {
					mobileCard: {
						slot: "footer",
					},
				},
				cell: ({ row }) => (
					<div className="text-right font-mono font-medium tabular-nums">
						{row.original.total ? formatIDRCurrency(row.original.total) : "—"}
					</div>
				),
			},
		],
		[],
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
						Pickup Radar
					</Button>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent>
						<OrderFilters
							values={search}
							role={role}
							userStoreIds={userStoreIds}
							onChange={handleFilterChange}
						/>
						{hasNoStoreAssignment ? (
							<div className="border border-dashed border-border bg-muted/20 px-6 py-10 text-center font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
								No store assigned
							</div>
						) : (
							<div className="grid gap-4">
								<DataTable
									columns={columns}
									data={orders}
									isLoading={ordersQuery.isPending || storesQuery.isPending}
								/>
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
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
