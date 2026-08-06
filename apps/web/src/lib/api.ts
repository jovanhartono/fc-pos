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

type QueryValue = string | number | boolean | undefined;

// An enum field keeps its literal union or hono rejects the call.
type SearchParamsOf<T> = {
	[K in keyof T]?: [Extract<T[K], string>] extends [never]
		? string
		: Extract<T[K], string>;
};

// A cleared filter is an absent param, never an empty one: four of the list
// endpoints reject `search=` outright, and `store_id=` would 400 the rest.
export function toSearchParams<T extends Record<string, QueryValue>>(
	query: T,
): SearchParamsOf<T> {
	return Object.fromEntries(
		Object.entries(query)
			.filter(([, value]) => value !== undefined && value !== "")
			.map(([key, value]) => [key, String(value)]),
	) as SearchParamsOf<T>;
}

function toPaginated<T>(
	response: { data: T[]; meta?: PaginationMeta },
	query?: { limit?: number; offset?: number },
): PaginatedData<T> {
	return {
		items: response.data,
		meta: response.meta ?? {
			limit: query?.limit ?? response.data.length,
			offset: query?.offset ?? 0,
			total: response.data.length,
		},
	};
}

type LoginSuccessResponse = InferResponseType<typeof rpc.api.auth.login.$post>;

export type Customer = InferResponseType<
	typeof rpc.api.admin.customers.$get
>["data"][number];
// Leaner than Customer — the lookup omits the originStore relation (the POS
// prefill reads only the name). 0-or-1, so the data is the row or null.
export type CustomerLookup = InferResponseType<
	typeof rpc.api.admin.customers.lookup.$get
>["data"];
export type User = InferResponseType<
	typeof rpc.api.admin.users.$get
>["data"][number];
export type Store = InferResponseType<
	typeof rpc.api.admin.stores.$get
>["data"][number];
export type Category = InferResponseType<
	typeof rpc.api.admin.categories.$get
>["data"][number];
export type Service = InferResponseType<
	typeof rpc.api.admin.services.$get
>["data"][number];
export type Product = InferResponseType<
	typeof rpc.api.admin.products.$get
>["data"][number];
export type PaymentMethod = InferResponseType<
	(typeof rpc.api.admin)["payment-methods"]["$get"]
>["data"][number];
export type Order = InferResponseType<
	typeof rpc.api.admin.orders.$get
>["data"][number];
export type OrderDetail = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["$get"]
>["data"];
export type OrderReceipt = InferResponseType<
	(typeof rpc.api.admin.orders)[":id"]["receipt"]["$get"]
>["data"];
export type Campaign = InferResponseType<
	typeof rpc.api.admin.campaigns.$get
>["data"][number];
export type ResolvedVoucher = InferResponseType<
	(typeof rpc.api.admin.campaigns)["resolve-code"]["$post"]
>["data"];
export type VoucherCodesResponse = InferResponseType<
	(typeof rpc.api.admin.campaigns)[":id"]["codes"]["$get"]
>["data"];
export type VoucherCode = VoucherCodesResponse["codes"][number];
export type ComplaintListItem = InferResponseType<
	typeof rpc.api.admin.complaints.$get
>["data"][number];
export type ComplaintDetail = InferResponseType<
	(typeof rpc.api.admin.complaints)[":id"]["$get"]
>["data"];
export type FetchComplaintsQuery = {
	store_id?: number;
	search?: string;
	limit?: number;
	offset?: number;
};

export type OpenComplaintPayload = {
	order_service_id: number;
	reason: string;
	start_rework?: boolean;
};
export type OrderServiceLookup = InferResponseType<
	(typeof rpc.api.admin.orders.services)["by-item-code"]["$get"]
>["data"];
export type OrderServiceLookupById = InferResponseType<
	(typeof rpc.api.admin.orders.services)["by-id"]["$get"]
>["data"];
export type QueueOrderServiceItem = InferResponseType<
	typeof rpc.api.admin.orders.services.queue.$get
>["data"][number];
export type PublicTrackedOrder = InferResponseType<
	typeof rpc.api.public.orders.track.$post
>["data"];
export type Shift = InferResponseType<
	typeof rpc.api.admin.shifts.$get
>["data"][number];
export type CurrentShift = InferResponseType<
	typeof rpc.api.admin.shifts.current.$get
>["data"];

export type FetchShiftsQuery = {
	user_id?: number;
	store_id?: number;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
};

export type ReportOverview = InferResponseType<
	typeof rpc.api.admin.reports.overview.$get
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

export type FinancialReport = InferResponseType<
	typeof rpc.api.admin.reports.financial.$get
>["data"];

export type OrdersFlowReport = InferResponseType<
	(typeof rpc.api.admin.reports)["orders-flow"]["$get"]
>["data"];

export type PaymentMixReport = InferResponseType<
	(typeof rpc.api.admin.reports)["payment-mix"]["$get"]
>["data"];

export type CustomerAcquisitionReport = InferResponseType<
	(typeof rpc.api.admin.reports)["customer-acquisition"]["$get"]
>["data"];

export type RefundTrendReport = InferResponseType<
	(typeof rpc.api.admin.reports)["refund-trend"]["$get"]
>["data"];

export type WorkerProductivityReport = InferResponseType<
	(typeof rpc.api.admin.reports)["worker-productivity"]["$get"]
>["data"];

export type CampaignEffectivenessReport = InferResponseType<
	(typeof rpc.api.admin.reports)["campaign-effectiveness"]["$get"]
>["data"];

export type AgingQueueItem = InferResponseType<
	(typeof rpc.api.admin.reports)["aging-queue"]["$get"]
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
// Money crosses the wire as the digit string the currency field produced; the
// server is what turns it into a number. So these payloads are the schemas'
// input side, not their parsed output.
export type CreateServicePayload = z.input<typeof POSTServiceSchema>;
export type UpdateServicePayload = z.input<typeof POSTServiceSchema>;
export type CreateProductPayload = z.input<typeof POSTProductSchema>;
export type UpdateProductPayload = z.input<typeof POSTProductSchema>;
export type CreatePaymentMethodPayload = z.infer<
	typeof POSTPaymentMethodSchema
>;
export type UpdatePaymentMethodPayload = z.infer<
	typeof POSTPaymentMethodSchema
>;
export type CreateOrderPayload = z.input<typeof POSTOrderSchema> & {
	voucher_codes: string[];
};

export type TrackPublicOrderPayload = {
	code: string;
	phone_number: string;
};

export type FetchOrdersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	store_id?: number;
	status?:
		| "created"
		| "processing"
		| "ready_for_pickup"
		| "completed"
		| "cancelled";
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
	role?: "admin" | "cashier" | "worker" | "courier";
};

export type FetchCampaignsQuery = {
	store_id?: number;
	is_active?: boolean;
};

export type CampaignBasePayload = {
	code: string;
	name: string;
	min_order_total: string;
	starts_at?: Date | null;
	ends_at?: Date | null;
	is_active: boolean;
	store_ids: number[];
	eligible_service_ids: number[];
	redemption_mode: "listed" | "code";
	usage_limit?: number | null;
	code_count?: number;
};

export type CampaignFixedPayload = CampaignBasePayload & {
	discount_type: "fixed";
	discount_value: string;
	max_discount?: string | null;
};

export type CampaignPercentagePayload = CampaignBasePayload & {
	discount_type: "percentage";
	discount_value: string;
	max_discount?: string | null;
};

export type CampaignBogoPayload = CampaignBasePayload & {
	discount_type: "buy_n_get_m_free";
	buy_quantity: number;
	free_quantity: number;
};

export type CampaignPayload =
	| CampaignFixedPayload
	| CampaignPercentagePayload
	| CampaignBogoPayload;

export type OrderCancelReason =
	| "customer_request"
	| "cannot_process"
	| "damaged_intake"
	| "duplicate_order"
	| "other";

export type UpdateOrderServiceStatusPayload = {
	cancel_note?: string;
	cancel_reason?: OrderCancelReason;
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

export type UpdateOrderPaymentPayload = {
	payment_method_id: number;
};

export type UpdateOrderCourierPayload = {
	collected_by: number | null;
};

export type PhotoContentType = "image/jpeg" | "image/png" | "image/webp";

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
	items: Array<
		({ order_service_id: number } | { order_product_id: number }) & {
			reason: OrderRefundReason;
			note?: string;
		}
	>;
};

export type CancelOrderPayload = {
	items: Array<
		({ order_service_id: number } | { order_product_id: number }) & {
			reason: OrderCancelReason;
			note?: string;
		}
	>;
};

export type UpdateUserStoresPayload = {
	store_ids: number[];
};

export const queryKeys = {
	customers: (query?: FetchCustomersQuery) =>
		["customers", query ?? {}] as const,
	users: (query?: FetchUsersQuery) => ["users", query ?? {}] as const,
	me: ["me"] as const,
	stores: ["stores"] as const,
	categories: ["categories"] as const,
	services: ["services"] as const,
	products: ["products"] as const,
	paymentMethods: ["payment-methods"] as const,
	orders: (query?: FetchOrdersQuery) => ["orders", query ?? {}] as const,
	orderDetail: (id: number) => ["order-detail", id] as const,
	campaigns: (query?: FetchCampaignsQuery) =>
		["campaigns", query ?? {}] as const,
	campaignVoucherCodes: (id: number) => ["campaigns", id, "codes"] as const,
	complaints: (query?: FetchComplaintsQuery) =>
		["complaints", query ?? {}] as const,
	complaintDetail: (id: number) => ["complaint-detail", id] as const,
	orderServiceLookup: (itemCode: string) =>
		["order-service-lookup", itemCode] as const,
	orderServiceQueue: (
		query?: Pick<
			FetchOrderServiceQueueQuery,
			"store_id" | "search" | "status" | "date_from" | "date_to"
		>,
	) => ["order-service-queue", query ?? {}] as const,
	shifts: (query?: FetchShiftsQuery) => ["shifts", query ?? {}] as const,
	shiftCurrent: ["shift-current"] as const,
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
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response, query);
}

// Exact-phone lookup for the POS name-prefill. Returns the matching customer or
// null — phone is identity, so 0-or-1. UX-only; checkout still find-or-creates
// by phone server-side (ADR-0011).
export function fetchCustomerByPhone(phone: string): Promise<CustomerLookup> {
	return parseSuccessData<CustomerLookup>(
		rpcWithAuth().api.admin.customers.lookup.$get({ query: { phone } }),
	);
}

export async function fetchUsersPage(
	query?: FetchUsersQuery,
): Promise<PaginatedData<User>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.users.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response, query);
}

export type Me = InferResponseType<typeof rpc.api.admin.users.me.$get>["data"];

export async function fetchMe() {
	return parseSuccessData<Me>(rpcWithAuth().api.admin.users.me.$get());
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

export async function fetchOrdersPage(
	query?: FetchOrdersQuery,
): Promise<PaginatedData<Order>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.orders.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response, query);
}

export async function fetchCampaigns(query?: FetchCampaignsQuery) {
	const response = await parseResponse(
		rpcWithAuth().api.admin.campaigns.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);
	return response.data;
}

export async function createCampaign(payload: CampaignPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.campaigns.$post({ json: payload }),
	);
}

export type UpdateCampaignPayload = {
	code?: string;
	name?: string;
	discount_type?: "fixed" | "percentage" | "buy_n_get_m_free";
	discount_value?: string;
	min_order_total?: string;
	max_discount?: string | null;
	starts_at?: Date | null;
	ends_at?: Date | null;
	is_active?: boolean;
	store_ids?: number[];
	eligible_service_ids?: number[];
	buy_quantity?: number | null;
	free_quantity?: number | null;
	usage_limit?: number | null;
};

export async function updateCampaign(
	id: number,
	payload: UpdateCampaignPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.campaigns[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export type ResolveVoucherCodePayload = {
	code: string;
	store_id: number;
	gross_total: number;
};

export function resolveVoucherCode(payload: ResolveVoucherCodePayload) {
	return parseSuccessData<ResolvedVoucher>(
		rpcWithAuth().api.admin.campaigns["resolve-code"].$post({ json: payload }),
	);
}

export function fetchCampaignVoucherCodes(campaignId: number) {
	return parseSuccessData<VoucherCodesResponse>(
		rpcWithAuth().api.admin.campaigns[":id"].codes.$get({
			param: { id: String(campaignId) },
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

export async function fetchOrderReceipt(id: number) {
	return parseSuccessData<OrderReceipt>(
		rpcWithAuth().api.admin.orders[":id"].receipt.$get({
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
				query && Object.keys(query).length > 0 ? toSearchParams(query) : {},
		}),
	);

	return toPaginated(response, query);
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

export async function updateOrderCourier(
	orderId: number,
	payload: UpdateOrderCourierPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].courier.$patch({
			param: { id: String(orderId) },
			json: payload,
		}),
	);
}

export async function fetchComplaintsPage(
	query?: FetchComplaintsQuery,
): Promise<PaginatedData<ComplaintListItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.complaints.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response, query);
}

export function fetchComplaintDetail(id: number) {
	return parseSuccessData<ComplaintDetail>(
		rpcWithAuth().api.admin.complaints[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export async function openComplaint(payload: OpenComplaintPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.complaints.$post({ json: payload }),
	);
}

export async function addComplaintRework(complaintId: number) {
	return parseResponse(
		rpcWithAuth().api.admin.complaints[":id"].rework.$post({
			param: { id: String(complaintId) },
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
	signal?: AbortSignal,
) {
	const response = await fetch(uploadUrl, {
		method: "PUT",
		headers: {
			"Content-Type": contentType,
		},
		body: file,
		signal,
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

export async function fetchCurrentShift() {
	return parseSuccessData<CurrentShift>(
		rpcWithAuth().api.admin.shifts.current.$get(),
	);
}

export async function fetchShifts(
	query?: FetchShiftsQuery,
): Promise<PaginatedData<Shift>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.shifts.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response, query);
}

export async function clockInShift(payload: { store_id: number }) {
	return parseResponse(
		rpcWithAuth().api.admin.shifts["clock-in"].$post({ json: payload }),
	);
}

export async function clockOutShift() {
	return parseResponse(rpcWithAuth().api.admin.shifts["clock-out"].$post());
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
			query: toSearchParams({
				store_id: query?.store_id,
				limit: query?.limit,
				offset: query?.offset,
			}),
		}),
	);
	return toPaginated(response, query);
}
