import {
	CrosshairSimpleIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DateRangeFilter } from "@/features/orders/components/date-range-filter";
import { PickupRadar } from "@/features/orders/components/pickup-radar";
import type { Order } from "@/lib/api";
import {
	currentUserDetailQueryOptions,
	ordersPageQueryOptions,
	storesQueryOptions,
} from "@/lib/query-options";
import {
	formatOrderStatus,
	formatPaymentStatus,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";
import { getCurrentUser } from "@/stores/auth-store";
import { useSheet } from "@/stores/sheet-store";

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

		if (currentUser) {
			await context.queryClient.ensureQueryData(
				currentUserDetailQueryOptions(currentUser.id),
			);
		}

		if (currentUser?.role === "admin" || deps.storeId !== undefined) {
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
	const [searchInput, setSearchInput] = useState(search.search ?? "");

	const storesQuery = useQuery(storesQueryOptions());
	const currentUserDetailQuery = useQuery({
		...currentUserDetailQueryOptions(currentUser?.id ?? -1),
		enabled: !!currentUser,
	});

	const userStoreIds =
		currentUserDetailQuery.data?.userStores?.map((item) => item.store_id) ?? [];

	useEffect(() => {
		if (!currentUser || search.storeId !== undefined) {
			return;
		}

		if (currentUser.role === "admin") {
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
	}, [currentUser, navigate, search.storeId, userStoreIds]);

	useEffect(() => {
		setSearchInput(search.search ?? "");
	}, [search.search]);

	const parsedStoreId = search.storeId;
	const orderQuery =
		currentUser?.role === "admin"
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
		enabled: currentUser?.role === "admin" ? true : parsedStoreId !== undefined,
	});

	const hasNoStoreAssignment =
		currentUser?.role !== "admin" &&
		currentUserDetailQuery.isSuccess &&
		userStoreIds.length === 0;

	const openSheet = useSheet((state) => state.openSheet);

	const orders = ordersQuery.data?.items ?? [];
	const orderCount = ordersQuery.data?.meta.total ?? 0;

	const handleOpenPickupRadar = useCallback(() => {
		openSheet({
			title: "Pickup Radar",
			description: "Orders that can leave the store now.",
			content: <PickupRadar orders={orders} />,
		});
	}, [openSheet, orders]);

	const columns = useMemo<ColumnDef<Order>[]>(
		() => [
			{
				accessorKey: "code",
				header: "Order Code",
				cell: ({ row }) => (
					<Link
						to="/orders/$orderId"
						params={{ orderId: String(row.original.id) }}
						className="underline"
					>
						{row.original.code}
					</Link>
				),
			},
			{
				id: "store",
				header: "Store",
				cell: ({ row }) => row.original.store_code,
			},
			{ accessorKey: "customer_name", header: "Customer" },
			{
				accessorKey: "status",
				header: "Status",
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
					<Badge
						variant={getPaymentStatusBadgeVariant(row.original.payment_status)}
					>
						{formatPaymentStatus(row.original.payment_status)}
					</Badge>
				),
			},
		],
		[],
	);

	const handleAddOrder = () => {
		void navigate({
			to: "/orders/new",
		});
	};

	const visibleStores =
		currentUser?.role === "admin"
			? (storesQuery.data ?? [])
			: (storesQuery.data ?? []).filter((store) =>
					userStoreIds.includes(store.id),
				);
	const storeFilterItems = useMemo(
		() => [
			...(currentUser?.role === "admin"
				? [{ value: "all", label: "All stores" }]
				: []),
			...visibleStores.map((store) => ({
				value: String(store.id),
				label: `${store.code} - ${store.name}`,
			})),
		],
		[currentUser?.role, visibleStores],
	);

	return (
		<>
			<PageHeader
				title="Orders"
				actions={
					<>
						<Badge
							variant={ordersQuery.isPending ? "secondary" : "outline"}
						>{`${orderCount} items`}</Badge>
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
					<CardContent className="pt-6">
						<div className="mb-4 flex flex-wrap items-center gap-2">
							<form
								className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(16rem,20rem)_auto_auto] sm:items-end"
								onSubmit={(event) => {
									event.preventDefault();
									const nextSearch = searchInput.trim();

									void navigate({
										search: (prev) => ({
											...prev,
											page: 1,
											search: nextSearch || undefined,
										}),
									});
								}}
							>
								<Field>
									<FieldLabel htmlFor="orders-search">Search</FieldLabel>
									<Input
										id="orders-search"
										value={searchInput}
										onChange={(event) => setSearchInput(event.target.value)}
										placeholder="Order ID or line ID"
										className="h-10"
									/>
								</Field>
								<Button
									type="submit"
									variant="outline"
									icon={<MagnifyingGlassIcon className="size-4" />}
								>
									Search
								</Button>
								{search.search ? (
									<Button
										type="button"
										variant="outline"
										icon={<XIcon className="size-4" />}
										onClick={() => {
											setSearchInput("");
											void navigate({
												search: (prev) => ({
													...prev,
													page: 1,
													search: undefined,
												}),
											});
										}}
									>
										Clear
									</Button>
								) : null}
							</form>
							<Select
								items={storeFilterItems}
								value={
									currentUser?.role === "admin"
										? (search.storeId?.toString() ?? "all")
										: (search.storeId?.toString() ?? "")
								}
								onValueChange={(value) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page: 1,
											storeId:
												value && value !== "all" ? Number(value) : undefined,
										}),
									});
								}}
							>
								<SelectTrigger className="h-10 min-w-48 w-max">
									<SelectValue placeholder="Filter by store" />
								</SelectTrigger>
								<SelectContent>
									{currentUser?.role === "admin" ? (
										<SelectItem value="all">All stores</SelectItem>
									) : null}
									{visibleStores.map((store) => (
										<SelectItem key={store.id} value={String(store.id)}>
											{`${store.code} - ${store.name}`}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="mb-4">
							<DateRangeFilter
								resetOnSelect
								dateFrom={search.dateFrom}
								dateTo={search.dateTo}
								onRangeChange={({ dateFrom, dateTo }) => {
									void navigate({
										search: (prev) => ({
											...prev,
											page: 1,
											dateFrom,
											dateTo,
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
							<div className="rounded border border-dashed border-border bg-muted/30 p-8 text-center">
								<p className="font-medium text-foreground text-sm">
									No store assigned
								</p>
								<p className="mt-1 text-muted-foreground text-sm">
									Ask an admin to assign you to a store before viewing orders.
								</p>
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
