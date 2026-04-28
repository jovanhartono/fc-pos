import type {
	POSTCategorySchema,
	POSTCustomerSchema,
	POSTOrderPickupEventPresignSchema,
	POSTOrderPickupEventSchema,
	POSTOrderSchema,
	POSTPaymentMethodSchema,
	POSTProductSchema,
	POSTServiceSchema,
	POSTStoreSchema,
	POSTUserSchema,
	PUTCustomerSchema,
	PUTUserSchema,
} from "@fresclean/api/schema";
import type {
	ComparableSummary,
	KpiDelta,
	ReportGranularity,
} from "@fresclean/api/types";

export type { ComparableSummary, KpiDelta, ReportGranularity };

import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import { rpc, rpcWithAuth } from "@/lib/rpc";
import { getCurrentUser } from "@/stores/auth-store";

export interface ApiSuccess<T> {
	success: true;
	message?: string;
	data: T;
}

export interface PaginationMeta {
	total: number;
	limit: number;
	offset: number;
}

export interface PaginatedData<T> {
	items: T[];
	meta: PaginationMeta;
}

async function parseSuccessData<T>(
	request: Parameters<typeof parseResponse>[0],
): Promise<T> {
	const response = await parseResponse(request);
	return response.data;
}

const loginRoute = rpc.api.auth.login.$post;
const customersRoute = rpc.api.admin.customers.$get;
const usersRoute = rpc.api.admin.users.$get;
const userDetailRoute = rpc.api.admin.users[":id"].$get;
const storesRoute = rpc.api.admin.stores.$get;
const categoriesRoute = rpc.api.admin.categories.$get;
const servicesRoute = rpc.api.admin.services.$get;
const productsRoute = rpc.api.admin.products.$get;
const paymentMethodsRoute = rpc.api.admin["payment-methods"].$get;
const ordersRoute = rpc.api.admin.orders.$get;
const orderDetailRoute = rpc.api.admin.orders[":id"].$get;
const campaignsRoute = rpc.api.admin.campaigns.$get;
const campaignDetailRoute = rpc.api.admin.campaigns[":id"].$get;
const orderServiceByIdRoute = rpc.api.admin.orders.services["by-id"].$get;
const orderServiceByItemCodeRoute =
	rpc.api.admin.orders.services["by-item-code"].$get;
const orderServiceQueueRoute = rpc.api.admin.orders.services.queue.$get;
const myOrderServicesRoute = rpc.api.admin.orders.services.me.$get;
const dashboardCountsRoute = rpc.api.admin.dashboard.counts.$get;
const dashboardOverviewRoute = rpc.api.admin.dashboard.overview.$get;
const shiftsRoute = rpc.api.admin.shifts.$get;
const shiftCurrentRoute = rpc.api.admin.shifts.current.$get;
const dailyReportRoute = rpc.api.admin.reports.daily.$get;
const reportOverviewRoute = rpc.api.admin.reports.overview.$get;
const financialRoute = rpc.api.admin.reports.financial.$get;
const ordersFlowRoute = rpc.api.admin.reports["orders-flow"].$get;
const paymentMixRoute = rpc.api.admin.reports["payment-mix"].$get;
const customerAcquisitionRoute =
	rpc.api.admin.reports["customer-acquisition"].$get;
const refundTrendRoute = rpc.api.admin.reports["refund-trend"].$get;
const workerProductivityRoute =
	rpc.api.admin.reports["worker-productivity"].$get;
const campaignEffectivenessRoute =
	rpc.api.admin.reports["campaign-effectiveness"].$get;
const agingQueueRoute = rpc.api.admin.reports["aging-queue"].$get;
const publicTrackOrderRoute = rpc.api.public.orders.track.$post;

type LoginSuccessResponse = Extract<
	InferResponseType<typeof loginRoute>,
	{ success: true }
>;

export type Customer = InferResponseType<typeof customersRoute>["data"][number];
export type User = InferResponseType<typeof usersRoute>["data"][number];
export type UserDetail = Extract<
	InferResponseType<typeof userDetailRoute>,
	{ success: true }
>["data"];
export type Store = InferResponseType<typeof storesRoute>["data"][number];
export type Category = InferResponseType<
	typeof categoriesRoute
>["data"][number];
export type Service = InferResponseType<typeof servicesRoute>["data"][number];
export type Product = InferResponseType<typeof productsRoute>["data"][number];
export type PaymentMethod = InferResponseType<
	typeof paymentMethodsRoute
>["data"][number];
export type Order = Extract<
	InferResponseType<typeof ordersRoute>,
	{ success: true }
>["data"][number];
export type OrderDetail = Extract<
	InferResponseType<typeof orderDetailRoute>,
	{ success: true }
>["data"];
export type Campaign = InferResponseType<typeof campaignsRoute>["data"][number];
export type CampaignDetail = Extract<
	InferResponseType<typeof campaignDetailRoute>,
	{ success: true }
>["data"];
export type OrderServiceLookup = Extract<
	InferResponseType<typeof orderServiceByItemCodeRoute>,
	{ success: true }
>["data"];
export type OrderServiceLookupById = Extract<
	InferResponseType<typeof orderServiceByIdRoute>,
	{ success: true }
>["data"];
export type QueueOrderServiceItem = Extract<
	InferResponseType<typeof orderServiceQueueRoute>,
	{ success: true }
>["data"][number];
export type MyOrderServiceItem = Extract<
	InferResponseType<typeof myOrderServicesRoute>,
	{ success: true }
>["data"][number];
export type PublicTrackedOrder = Extract<
	InferResponseType<typeof publicTrackOrderRoute>,
	{ success: true }
>["data"];
export type Shift = Extract<
	InferResponseType<typeof shiftsRoute>,
	{ success: true }
>["data"][number];
export type CurrentShift = Extract<
	InferResponseType<typeof shiftCurrentRoute>,
	{ success: true }
>["data"];

export type FetchShiftsQuery = {
	user_id?: number;
	store_id?: number;
	from?: string;
	to?: string;
};

export type DailyReport = Extract<
	InferResponseType<typeof dailyReportRoute>,
	{ success: true }
>["data"];

export type FetchDailyReportQuery = {
	date: string;
	store_id?: number;
};

export type ReportOverview = Extract<
	InferResponseType<typeof reportOverviewRoute>,
	{ success: true }
>["data"];

export type FetchReportOverviewQuery = {
	date: string;
	store_id?: number;
	trend_days?: number;
};

export type FetchReportRangeQuery = {
	from: string;
	to: string;
	store_id?: number;
	granularity?: ReportGranularity;
};

export type FinancialReport = Extract<
	InferResponseType<typeof financialRoute>,
	{ success: true }
>["data"];

export type OrdersFlowReport = Extract<
	InferResponseType<typeof ordersFlowRoute>,
	{ success: true }
>["data"];

export type PaymentMixReport = Extract<
	InferResponseType<typeof paymentMixRoute>,
	{ success: true }
>["data"];

export type CustomerAcquisitionReport = Extract<
	InferResponseType<typeof customerAcquisitionRoute>,
	{ success: true }
>["data"];

export type RefundTrendReport = Extract<
	InferResponseType<typeof refundTrendRoute>,
	{ success: true }
>["data"];

export type WorkerProductivityReport = Extract<
	InferResponseType<typeof workerProductivityRoute>,
	{ success: true }
>["data"];

export type CampaignEffectivenessReport = Extract<
	InferResponseType<typeof campaignEffectivenessRoute>,
	{ success: true }
>["data"];

export type AgingQueueItem = Extract<
	InferResponseType<typeof agingQueueRoute>,
	{ success: true }
>["data"][number];

export interface FetchAgingQueueQuery {
	store_id?: number;
	limit?: number;
	offset?: number;
}

export type LoginPayload = {
	username: string;
	password: string;
};

export type CreateCustomerPayload = Omit<
	z.infer<typeof POSTCustomerSchema>,
	"origin_store_id"
> & {
	origin_store_id?: number;
};
export type UpdateCustomerPayload = z.infer<typeof PUTCustomerSchema>;
export type CreateUserPayload = z.infer<typeof POSTUserSchema>;
export type UpdateUserPayload = z.infer<typeof PUTUserSchema>;
export type CreateStorePayload = z.infer<typeof POSTStoreSchema>;
export type UpdateStorePayload = z.infer<typeof POSTStoreSchema>;
export type CreateCategoryPayload = z.infer<typeof POSTCategorySchema>;
export type UpdateCategoryPayload = z.infer<typeof POSTCategorySchema>;
export type CreateServicePayload = z.infer<typeof POSTServiceSchema>;
export type UpdateServicePayload = z.infer<typeof POSTServiceSchema>;
export type CreateProductPayload = z.infer<typeof POSTProductSchema>;
export type UpdateProductPayload = z.infer<typeof POSTProductSchema>;
export type CreatePaymentMethodPayload = z.infer<
	typeof POSTPaymentMethodSchema
>;
export type UpdatePaymentMethodPayload = z.infer<
	typeof POSTPaymentMethodSchema
>;
export type CreateOrderPayload = z.infer<typeof POSTOrderSchema>;

export type TrackPublicOrderPayload = {
	code: string;
	phone_number: string;
};

export type FetchOrdersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	store_id?: number;
	status?: "created" | "processing" | "completed" | "cancelled";
	payment_status?: "paid" | "unpaid";
	date_from?: string;
	date_to?: string;
};

export type FetchOrderServiceQueueQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	store_id?: number;
	status?:
		| "queued"
		| "processing"
		| "quality_check"
		| "qc_reject"
		| "ready_for_pickup"
		| "picked_up"
		| "refunded"
		| "cancelled";
	date_from?: string;
	date_to?: string;
};

export type FetchCustomersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
};

export type FetchUsersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	is_active?: boolean;
	role?: "admin" | "cashier" | "worker";
};

export type FetchCampaignsQuery = {
	store_id?: number;
	is_active?: boolean;
};

export type CampaignPayload = {
	code: string;
	name: string;
	discount_type: "fixed" | "percentage";
	discount_value: string;
	min_order_total: string;
	max_discount?: string | null;
	starts_at?: Date | null;
	ends_at?: Date | null;
	is_active: boolean;
	store_ids: number[];
};

export type UpdateOrderServiceStatusPayload = {
	cancel_reason?: string;
	note?: string;
	status:
		| "queued"
		| "processing"
		| "quality_check"
		| "qc_reject"
		| "ready_for_pickup"
		| "picked_up"
		| "refunded"
		| "cancelled";
};

export type UpdateOrderServiceHandlerPayload = {
	handler_id: number | null;
	note?: string;
};

export type UpdateOrderPaymentPayload = {
	payment_method_id: number;
};

export type PhotoContentType =
	| "image/jpeg"
	| "image/png"
	| "image/webp"
	| "image/heic";

export type PresignOrderServicePhotoPayload = {
	content_type: PhotoContentType;
};

export type SaveOrderServicePhotoPayload = {
	image_path: string;
	note?: string;
};

export type PresignOrderDropoffPhotoPayload = {
	content_type: PhotoContentType;
};

export type SaveOrderDropoffPhotoPayload = {
	image_path: string;
};

export type PresignOrderPickupEventPayload = z.infer<
	typeof POSTOrderPickupEventPresignSchema
>;

export type CreateOrderPickupEventPayload = z.infer<
	typeof POSTOrderPickupEventSchema
>;

export type OrderRefundReason =
	| "damaged"
	| "cannot_process"
	| "lost"
	| "other"
	| "customer_cancelled";

export type CreateOrderRefundPayload = {
	note?: string;
	items: Array<{
		order_service_id: number;
		reason: OrderRefundReason;
		note?: string;
	}>;
};

export type CancelOrderPayload = {
	cancel_reason: string;
};

export type UpdateUserStoresPayload = {
	store_ids: number[];
};

export const queryKeys = {
	customers: (query?: FetchCustomersQuery) =>
		["customers", query ?? {}] as const,
	users: (query?: FetchUsersQuery) => ["users", query ?? {}] as const,
	userDetail: (id: number) => ["user-detail", id] as const,
	stores: ["stores"] as const,
	categories: ["categories"] as const,
	services: ["services"] as const,
	products: ["products"] as const,
	paymentMethods: ["payment-methods"] as const,
	orders: (query?: FetchOrdersQuery) => ["orders", query ?? {}] as const,
	orderDetail: (id: number) => ["order-detail", id] as const,
	campaigns: (query?: FetchCampaignsQuery) =>
		["campaigns", query ?? {}] as const,
	campaignDetail: (id: number) => ["campaign-detail", id] as const,
	orderServiceLookup: (itemCode: string) =>
		["order-service-lookup", itemCode] as const,
	orderServiceQueue: (
		query?: Pick<
			FetchOrderServiceQueueQuery,
			"store_id" | "search" | "status" | "date_from" | "date_to"
		>,
	) => ["order-service-queue", query ?? {}] as const,
	myOrderServices: (storeId?: number) =>
		["my-order-services", storeId ?? "all"] as const,
	dashboard: ["dashboard"] as const,
	dashboardOverview: (query?: FetchDashboardOverviewQuery) =>
		["dashboard-overview", query ?? {}] as const,
	shifts: (query?: FetchShiftsQuery) => ["shifts", query ?? {}] as const,
	shiftCurrent: ["shift-current"] as const,
	dailyReport: (query: FetchDailyReportQuery) =>
		["daily-report", query] as const,
	reportOverview: (query: FetchReportOverviewQuery) =>
		["report-overview", query] as const,
	financial: (query: FetchReportRangeQuery) =>
		["report-financial", query] as const,
	ordersFlow: (query: FetchReportRangeQuery) =>
		["report-orders-flow", query] as const,
	paymentMix: (query: FetchReportRangeQuery) =>
		["report-payment-mix", query] as const,
	customerAcquisition: (query: FetchReportRangeQuery) =>
		["report-customer-acquisition", query] as const,
	refundTrend: (query: FetchReportRangeQuery) =>
		["report-refund-trend", query] as const,
	workerProductivity: (query: FetchReportRangeQuery) =>
		["report-worker-productivity", query] as const,
	campaignEffectiveness: (query: FetchReportRangeQuery) =>
		["report-campaign-effectiveness", query] as const,
	agingQueue: (query?: FetchAgingQueueQuery) =>
		["report-aging-queue", query ?? {}] as const,
};

export async function login(payload: LoginPayload) {
	return parseSuccessData<LoginSuccessResponse["data"]>(
		rpc.api.auth.login.$post({ json: payload }),
	);
}

export async function fetchCustomers() {
	const response = await parseResponse(
		rpcWithAuth().api.admin.customers.$get(),
	);
	return response.data;
}

export async function fetchCustomersPage(
	query?: FetchCustomersQuery,
): Promise<PaginatedData<Customer>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.customers.$get({
			query:
				query && Object.keys(query).length > 0
					? {
							...(query.limit !== undefined
								? { limit: String(query.limit) }
								: {}),
							...(query.offset !== undefined
								? { offset: String(query.offset) }
								: {}),
							...(query.search ? { search: query.search } : {}),
						}
					: undefined,
		}),
	);

	return {
		items: response.data,
		meta: (response.meta ?? {
			limit: query?.limit ?? response.data.length,
			offset: query?.offset ?? 0,
			total: response.data.length,
		}) as PaginationMeta,
	};
}

export async function fetchUsers() {
	const response = await parseResponse(rpcWithAuth().api.admin.users.$get());
	return response.data;
}

export async function fetchUsersPage(
	query?: FetchUsersQuery,
): Promise<PaginatedData<User>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.users.$get({
			query:
				query && Object.keys(query).length > 0
					? {
							...(query.limit !== undefined
								? { limit: String(query.limit) }
								: {}),
							...(query.offset !== undefined
								? { offset: String(query.offset) }
								: {}),
							...(query.search ? { search: query.search } : {}),
							...(query.is_active !== undefined
								? { is_active: String(query.is_active) }
								: {}),
							...(query.role ? { role: query.role } : {}),
						}
					: undefined,
		}),
	);

	return {
		items: response.data,
		meta: response.meta as PaginationMeta,
	};
}

export async function fetchUserById(id: number) {
	return parseSuccessData<UserDetail>(
		rpcWithAuth().api.admin.users[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export async function fetchCurrentUserDetail() {
	const current = getCurrentUser();
	if (!current) {
		throw new Error("User not authenticated");
	}
	return fetchUserById(current.id);
}

export async function fetchStores() {
	const response = await parseResponse(rpcWithAuth().api.admin.stores.$get());
	return response.data;
}

export async function fetchCategories() {
	const response = await parseResponse(
		rpcWithAuth().api.admin.categories.$get(),
	);
	return response.data;
}

export async function fetchServices() {
	const response = await parseResponse(rpcWithAuth().api.admin.services.$get());
	return response.data;
}

export async function fetchProducts() {
	const response = await parseResponse(rpcWithAuth().api.admin.products.$get());
	return response.data;
}

export async function fetchPaymentMethods() {
	const response = await parseResponse(
		rpcWithAuth().api.admin["payment-methods"].$get(),
	);
	return response.data;
}

export async function fetchOrders(query?: FetchOrdersQuery) {
	const response = await parseResponse(
		rpcWithAuth().api.admin.orders.$get({
			query:
				query && Object.keys(query).length > 0
					? {
							...(query.store_id !== undefined
								? { store_id: String(query.store_id) }
								: {}),
							...(query.search ? { search: query.search } : {}),
							...(query.status ? { status: query.status } : {}),
							...(query.payment_status
								? { payment_status: query.payment_status }
								: {}),
							...(query.date_from !== undefined
								? { date_from: query.date_from }
								: {}),
							...(query.date_to !== undefined
								? { date_to: query.date_to }
								: {}),
						}
					: undefined,
		}),
	);
	return response.data;
}

export async function fetchOrdersPage(
	query?: FetchOrdersQuery,
): Promise<PaginatedData<Order>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.orders.$get({
			query:
				query && Object.keys(query).length > 0
					? {
							...(query.limit !== undefined
								? { limit: String(query.limit) }
								: {}),
							...(query.offset !== undefined
								? { offset: String(query.offset) }
								: {}),
							...(query.store_id !== undefined
								? { store_id: String(query.store_id) }
								: {}),
							...(query.search ? { search: query.search } : {}),
							...(query.status ? { status: query.status } : {}),
							...(query.payment_status
								? { payment_status: query.payment_status }
								: {}),
							...(query.date_from !== undefined
								? { date_from: query.date_from }
								: {}),
							...(query.date_to !== undefined
								? { date_to: query.date_to }
								: {}),
						}
					: undefined,
		}),
	);

	return {
		items: response.data,
		meta: response.meta as PaginationMeta,
	};
}

export async function fetchCampaigns(query?: FetchCampaignsQuery) {
	const response = await parseResponse(
		rpcWithAuth().api.admin.campaigns.$get({
			query:
				query && Object.keys(query).length > 0
					? {
							...(query.store_id !== undefined
								? { store_id: String(query.store_id) }
								: {}),
							...(query.is_active !== undefined
								? { is_active: String(query.is_active) }
								: {}),
						}
					: undefined,
		}),
	);
	return response.data;
}

export async function fetchCampaignById(id: number) {
	return parseSuccessData<CampaignDetail>(
		rpcWithAuth().api.admin.campaigns[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export async function createCampaign(payload: CampaignPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.campaigns.$post({ json: payload }),
	);
}

export async function updateCampaign(
	id: number,
	payload: Partial<CampaignPayload>,
) {
	return parseResponse(
		rpcWithAuth().api.admin.campaigns[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function deleteCampaign(id: number) {
	return parseResponse(
		rpcWithAuth().api.admin.campaigns[":id"].$delete({
			param: { id: String(id) },
		}),
	);
}

export async function createCustomer(payload: CreateCustomerPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.customers.$post({
			json: payload as z.infer<typeof POSTCustomerSchema>,
		}),
	);
}

export async function updateCustomer(
	id: number,
	payload: UpdateCustomerPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.customers[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function createUser(payload: CreateUserPayload) {
	return parseResponse(rpcWithAuth().api.admin.users.$post({ json: payload }));
}

export async function updateUser(id: number, payload: UpdateUserPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.users[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function updateUserStores(
	id: number,
	payload: UpdateUserStoresPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.users[":id"].stores.$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function createStore(payload: CreateStorePayload) {
	return parseResponse(rpcWithAuth().api.admin.stores.$post({ json: payload }));
}

export async function updateStore(id: number, payload: UpdateStorePayload) {
	return parseResponse(
		rpcWithAuth().api.admin.stores[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function createCategory(payload: CreateCategoryPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.categories.$post({ json: payload }),
	);
}

export async function updateCategory(
	id: number,
	payload: UpdateCategoryPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.categories[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function createService(payload: CreateServicePayload) {
	return parseResponse(
		rpcWithAuth().api.admin.services.$post({ json: payload }),
	);
}

export async function updateService(id: number, payload: UpdateServicePayload) {
	return parseResponse(
		rpcWithAuth().api.admin.services[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function createProduct(payload: CreateProductPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.products.$post({ json: payload }),
	);
}

export async function updateProduct(id: number, payload: UpdateProductPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.products[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function createPaymentMethod(payload: CreatePaymentMethodPayload) {
	return parseResponse(
		rpcWithAuth().api.admin["payment-methods"].$post({ json: payload }),
	);
}

export async function updatePaymentMethod(
	id: number,
	payload: UpdatePaymentMethodPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin["payment-methods"][":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export async function createOrder(payload: CreateOrderPayload) {
	return parseResponse(rpcWithAuth().api.admin.orders.$post({ json: payload }));
}

export async function fetchOrderDetail(id: number) {
	return parseSuccessData<OrderDetail>(
		rpcWithAuth().api.admin.orders[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export async function lookupOrderServiceByItemCode(itemCode: string) {
	return parseSuccessData<OrderServiceLookup>(
		rpcWithAuth().api.admin.orders.services["by-item-code"].$get({
			query: { item_code: itemCode },
		}),
	);
}

export async function lookupOrderServiceById(serviceId: number) {
	return parseSuccessData<OrderServiceLookupById>(
		rpcWithAuth().api.admin.orders.services["by-id"].$get({
			query: { service_id: String(serviceId) },
		}),
	);
}

export async function fetchOrderServiceQueuePage(
	query?: FetchOrderServiceQueueQuery,
): Promise<PaginatedData<QueueOrderServiceItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.orders.services.queue.$get({
			query:
				query && Object.keys(query).length > 0
					? {
							...(query.limit !== undefined
								? { limit: String(query.limit) }
								: {}),
							...(query.offset !== undefined
								? { offset: String(query.offset) }
								: {}),
							...(query.store_id !== undefined
								? { store_id: String(query.store_id) }
								: {}),
							...(query.search ? { search: query.search } : {}),
							...(query.status !== undefined ? { status: query.status } : {}),
							...(query.date_from !== undefined
								? { date_from: query.date_from }
								: {}),
							...(query.date_to !== undefined
								? { date_to: query.date_to }
								: {}),
						}
					: {},
		}),
	);

	return {
		items: response.data,
		meta: response.meta as PaginationMeta,
	};
}

export async function fetchMyOrderServices(storeId?: number) {
	return parseSuccessData<MyOrderServiceItem[]>(
		rpcWithAuth().api.admin.orders.services.me.$get({
			query: storeId !== undefined ? { store_id: String(storeId) } : {},
		}),
	);
}

export async function updateOrderServiceStatus(
	orderId: number,
	serviceId: number,
	payload: UpdateOrderServiceStatusPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].status.$patch({
			param: { id: String(orderId), serviceId: String(serviceId) },
			json: payload,
		}),
	);
}

export async function updateOrderServiceHandler(
	orderId: number,
	serviceId: number,
	payload: UpdateOrderServiceHandlerPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].handler.$patch(
			{
				param: { id: String(orderId), serviceId: String(serviceId) },
				json: payload,
			},
		),
	);
}

export async function updateOrderPayment(
	orderId: number,
	payload: UpdateOrderPaymentPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].payment.$patch({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function presignOrderServicePhoto(
	orderId: number,
	serviceId: number,
	payload: PresignOrderServicePhotoPayload,
) {
	return parseSuccessData<{
		upload_url: string;
		key: string;
		expires_in_seconds: number;
	}>(
		rpcWithAuth().api.admin.orders[":id"].services[
			":serviceId"
		].photos.presign.$post({
			param: { id: String(orderId), serviceId: String(serviceId) },
			json: payload,
		}),
	);
}

export async function saveOrderServicePhoto(
	orderId: number,
	serviceId: number,
	payload: SaveOrderServicePhotoPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].photos.$post({
			param: { id: String(orderId), serviceId: String(serviceId) },
			json: payload,
		}),
	);
}

export async function deleteOrderServicePhoto(
	orderId: number,
	serviceId: number,
	photoId: number,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].photos[
			":photoId"
		].$delete({
			param: {
				id: String(orderId),
				serviceId: String(serviceId),
				photoId: String(photoId),
			},
		}),
	);
}

export async function presignOrderDropoffPhoto(
	orderId: number,
	payload: PresignOrderDropoffPhotoPayload,
) {
	return parseSuccessData<{
		upload_url: string;
		key: string;
		expires_in_seconds: number;
	}>(
		rpcWithAuth().api.admin.orders[":id"]["dropoff-photo"].presign.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function saveOrderDropoffPhoto(
	orderId: number,
	payload: SaveOrderDropoffPhotoPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"]["dropoff-photo"].$put({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function presignOrderPickupEvent(
	orderId: number,
	payload: PresignOrderPickupEventPayload,
) {
	return parseSuccessData<{
		upload_url: string;
		key: string;
		expires_in_seconds: number;
	}>(
		rpcWithAuth().api.admin.orders[":id"]["pickup-events"].presign.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function createOrderPickupEvent(
	orderId: number,
	payload: CreateOrderPickupEventPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"]["pickup-events"].$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function createOrderRefund(
	orderId: number,
	payload: CreateOrderRefundPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].refunds.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function cancelOrder(
	orderId: number,
	payload: CancelOrderPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].cancel.$post({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function uploadFileToPresignedUrl(
	uploadUrl: string,
	file: File,
	contentType: PhotoContentType,
) {
	const response = await fetch(uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Type": contentType,
		},
		body: file,
	});

	if (!response.ok) {
		throw new Error("Failed to upload file");
	}
}

export async function trackPublicOrder(payload: TrackPublicOrderPayload) {
	return parseSuccessData<PublicTrackedOrder>(
		rpc.api.public.orders.track.$post({ json: payload }),
	);
}

export type DashboardCounts = InferResponseType<
	typeof dashboardCountsRoute
>["data"];

export type DashboardOverview = Extract<
	InferResponseType<typeof dashboardOverviewRoute>,
	{ success: true }
>["data"];

export type FetchDashboardOverviewQuery = { date?: string };

export async function fetchDashboardCounts() {
	return parseSuccessData<DashboardCounts>(
		rpcWithAuth().api.admin.dashboard.counts.$get(),
	);
}

export async function fetchDashboardOverview(
	query?: FetchDashboardOverviewQuery,
) {
	return parseSuccessData<DashboardOverview>(
		rpcWithAuth().api.admin.dashboard.overview.$get({
			query: query?.date ? { date: query.date } : {},
		}),
	);
}

export async function fetchCurrentShift() {
	return parseSuccessData<CurrentShift>(
		rpcWithAuth().api.admin.shifts.current.$get(),
	);
}

export async function fetchShifts(query?: FetchShiftsQuery) {
	const response = await parseResponse(
		rpcWithAuth().api.admin.shifts.$get({
			query:
				query && Object.keys(query).length > 0
					? {
							...(query.user_id !== undefined
								? { user_id: String(query.user_id) }
								: {}),
							...(query.store_id !== undefined
								? { store_id: String(query.store_id) }
								: {}),
							...(query.from ? { from: query.from } : {}),
							...(query.to ? { to: query.to } : {}),
						}
					: undefined,
		}),
	);
	return response.data;
}

export async function clockInShift(payload: { store_id: number }) {
	return parseResponse(
		rpcWithAuth().api.admin.shifts["clock-in"].$post({ json: payload }),
	);
}

export async function clockOutShift() {
	return parseResponse(rpcWithAuth().api.admin.shifts["clock-out"].$post());
}

export async function fetchDailyReport(query: FetchDailyReportQuery) {
	return parseSuccessData<DailyReport>(
		rpcWithAuth().api.admin.reports.daily.$get({
			query: {
				date: query.date,
				...(query.store_id !== undefined
					? { store_id: String(query.store_id) }
					: {}),
			},
		}),
	);
}

export async function fetchReportOverview(query: FetchReportOverviewQuery) {
	return parseSuccessData<ReportOverview>(
		rpcWithAuth().api.admin.reports.overview.$get({
			query: {
				date: query.date,
				...(query.store_id !== undefined
					? { store_id: String(query.store_id) }
					: {}),
				...(query.trend_days !== undefined
					? { trend_days: String(query.trend_days) }
					: {}),
			},
		}),
	);
}

function toRangeQuery(query: FetchReportRangeQuery) {
	return {
		from: query.from,
		to: query.to,
		...(query.store_id !== undefined
			? { store_id: String(query.store_id) }
			: {}),
		...(query.granularity ? { granularity: query.granularity } : {}),
	};
}

export async function fetchFinancialReport(query: FetchReportRangeQuery) {
	return parseSuccessData<FinancialReport>(
		rpcWithAuth().api.admin.reports.financial.$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchOrdersFlowReport(query: FetchReportRangeQuery) {
	return parseSuccessData<OrdersFlowReport>(
		rpcWithAuth().api.admin.reports["orders-flow"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchPaymentMixReport(query: FetchReportRangeQuery) {
	return parseSuccessData<PaymentMixReport>(
		rpcWithAuth().api.admin.reports["payment-mix"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchCustomerAcquisitionReport(
	query: FetchReportRangeQuery,
) {
	return parseSuccessData<CustomerAcquisitionReport>(
		rpcWithAuth().api.admin.reports["customer-acquisition"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchRefundTrendReport(query: FetchReportRangeQuery) {
	return parseSuccessData<RefundTrendReport>(
		rpcWithAuth().api.admin.reports["refund-trend"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchWorkerProductivityReport(
	query: FetchReportRangeQuery,
) {
	return parseSuccessData<WorkerProductivityReport>(
		rpcWithAuth().api.admin.reports["worker-productivity"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchCampaignEffectivenessReport(
	query: FetchReportRangeQuery,
) {
	return parseSuccessData<CampaignEffectivenessReport>(
		rpcWithAuth().api.admin.reports["campaign-effectiveness"].$get({
			query: toRangeQuery(query),
		}),
	);
}

export async function fetchAgingQueueReport(
	query?: FetchAgingQueueQuery,
): Promise<PaginatedData<AgingQueueItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.reports["aging-queue"].$get({
			query: {
				...(query?.store_id !== undefined
					? { store_id: String(query.store_id) }
					: {}),
				...(query?.limit !== undefined ? { limit: String(query.limit) } : {}),
				...(query?.offset !== undefined
					? { offset: String(query.offset) }
					: {}),
			},
		}),
	);
	return {
		items: response.data,
		meta: (response.meta ?? {
			limit: query?.limit ?? response.data.length,
			offset: query?.offset ?? 0,
			total: response.data.length,
		}) as PaginationMeta,
	};
}
