import { CrosshairSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { DebouncedSearchInput } from "@/components/debounced-search-input";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-picker";
import { PickupRadar } from "@/features/orders/components/pickup-radar";
import { StoreAutocomplete } from "@/features/orders/components/store-autocomplete";
import type { Order } from "@/lib/api";
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

const orderCreatedFormatter = new Intl.DateTimeFormat("en-ID", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});

const ordersSearchSchema = z.object({
	page: z.coerce.number().int().positive().catch(1),
	search: z.string().trim().min(1).max(100).optional(),
	storeId: z.coerce.number().int().positive().optional(),
	dateFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	dateTo: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

const PAGE_SIZE = 25;

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
				ordersPageQueryOptions(
					deps.storeId !== undefined
						? {
								limit: PAGE_SIZE,
								offset: (deps.page - 1) * PAGE_SIZE,
								...(deps.search ? { search: deps.search } : {}),
								store_id: deps.storeId,
								...(deps.dateFrom ? { date_from: deps.dateFrom } : {}),
								...(deps.dateTo ? { date_to: deps.dateTo } : {}),
							}
						: {
								limit: PAGE_SIZE,
								offset: (deps.page - 1) * PAGE_SIZE,
								...(deps.search ? { search: deps.search } : {}),
								...(deps.dateFrom ? { date_from: deps.dateFrom } : {}),
								...(deps.dateTo ? { date_to: deps.dateTo } : {}),
							},
				),
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

	const handleSearchChange = useCallback(
		(next: string) => {
			void navigate({
				search: (prev) => ({
					...prev,
					page: 1,
					search: next || undefined,
				}),
			});
		},
		[navigate],
	);

	const parsedStoreId = search.storeId;
	const orderQuery =
		role === "admin"
			? parsedStoreId
				? {
						limit: PAGE_SIZE,
						offset: (search.page - 1) * PAGE_SIZE,
						...(search.search ? { search: search.search } : {}),
						store_id: parsedStoreId,
						...(search.dateFrom ? { date_from: search.dateFrom } : {}),
						...(search.dateTo ? { date_to: search.dateTo } : {}),
					}
				: {
						limit: PAGE_SIZE,
						offset: (search.page - 1) * PAGE_SIZE,
						...(search.search ? { search: search.search } : {}),
						...(search.dateFrom ? { date_from: search.dateFrom } : {}),
						...(search.dateTo ? { date_to: search.dateTo } : {}),
					}
			: parsedStoreId
				? {
						limit: PAGE_SIZE,
						offset: (search.page - 1) * PAGE_SIZE,
						...(search.search ? { search: search.search } : {}),
						store_id: parsedStoreId,
						...(search.dateFrom ? { date_from: search.dateFrom } : {}),
						...(search.dateTo ? { date_to: search.dateTo } : {}),
					}
				: undefined;

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
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(row.original.id) }}
						className="font-mono font-semibold text-foreground underline underline-offset-4 md:font-normal"
					>
						{row.original.code}
					</Link>
				),
			},
			{
				id: "created",
				header: "Created",
				meta: {
					mobileCard: {
						slot: "eyebrow",
					},
				},
				cell: ({ row }) => (
					<span className="font-mono font-medium text-muted-foreground text-xs tabular-nums">
						{orderCreatedFormatter.format(new Date(row.original.created_at))}
					</span>
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
					<span className="font-mono font-medium text-foreground">
						{row.original.store_code}
					</span>
				),
			},
			{
				accessorKey: "customer_name",
				header: "Customer",
				meta: {
					mobileCard: {
						label: "Customer",
						valueClassName: "truncate",
					},
				},
			},
			{
				id: "items",
				header: "Items",
				meta: {
					mobileCard: {
						label: "Items",
					},
				},
				cell: ({ row }) => (
					<span className="font-mono tabular-nums">
						{row.original.fulfillment.service_total_count}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
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

	const handleAddOrder = () => {
		void navigate({
			to: "/transactions",
		});
	};

	return (
		<>
			<PageHeader
				title="Orders"
				actions={
					<>
						<Button
							variant="outline"
							onClick={handleOpenPickupRadar}
							icon={<CrosshairSimpleIcon className="size-4" />}
						>
							Pickup Radar
						</Button>
						<Button
							onClick={handleAddOrder}
							icon={<PlusIcon className="size-4" />}
						>
							Add Order
						</Button>
					</>
				}
			/>
			<div className="grid gap-4">
				<Card>
					<CardContent>
						<div className="mb-4 flex flex-wrap items-center gap-2">
							<DebouncedSearchInput
								id="orders-search"
								value={search.search ?? ""}
								onDebouncedChange={handleSearchChange}
								placeholder="Order ID, customer, phone"
								ariaLabel="Search orders"
								className="w-full sm:w-72"
							/>
							<StoreAutocomplete
								id="orders-store-filter"
								hideLabel
								value={search.storeId?.toString() ?? ""}
								onValueChange={(value) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page: 1,
											storeId: value ? Number(value) : undefined,
										}),
									});
								}}
								allowedStoreIds={role === "admin" ? undefined : userStoreIds}
								allOptionLabel={role === "admin" ? "All stores" : undefined}
								placeholder="Filter by store"
								triggerClassName="h-10 w-max min-w-48 text-sm"
							/>
							<DateRangePicker
								resetOnSelect
								commitOnComplete
								from={search.dateFrom}
								to={search.dateTo}
								onChange={({ from, to }) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page: 1,
											dateFrom: from,
											dateTo: to,
										}),
									});
								}}
								onClear={() => {
									void navigate({
										search: (prev) => ({
											...prev,
											page: 1,
											dateFrom: undefined,
											dateTo: undefined,
										}),
									});
								}}
							/>
						</div>
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
