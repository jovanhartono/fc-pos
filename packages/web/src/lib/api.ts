import type {
	POSTCategorySchema,
	POSTCustomerSchema,
	POSTOrderSchema,
	POSTPaymentMethodSchema,
	POSTProductSchema,
	POSTServiceSchema,
	POSTStoreSchema,
	POSTUserSchema,
	PUTCustomerSchema,
	PUTUserSchema,
} from "@fresclean/api/schema";
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
const orderServiceByItemCodeRoute =
	rpc.api.admin.orders.services["by-item-code"].$get;
const myOrderServicesRoute = rpc.api.admin.orders.services.me.$get;
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
export type MyOrderServiceItem = Extract<
	InferResponseType<typeof myOrderServicesRoute>,
	{ success: true }
>["data"][number];
export type PublicTrackedOrder = Extract<
	InferResponseType<typeof publicTrackOrderRoute>,
	{ success: true }
>["data"];

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
	store_id?: number;
	status?: "created" | "processing" | "completed" | "cancelled";
	payment_status?: "paid" | "unpaid";
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
	limit?: number;
	offset?: number;
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
	note?: string;
	status:
		| "received"
		| "queued"
		| "processing"
		| "quality_check"
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

export type OrderServicePhotoType =
	| "dropoff"
	| "progress"
	| "pickup"
	| "refund";

export type PresignOrderServicePhotoPayload = {
	content_type: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
	photo_type: OrderServicePhotoType;
};

export type SaveOrderServicePhotoPayload = {
	photo_type: OrderServicePhotoType;
	s3_key: string;
};

export type OrderRefundReason = "damaged" | "cannot_process" | "lost" | "other";

export type CreateOrderRefundPayload = {
	note?: string;
	items: Array<{
		order_service_id: number;
		reason: OrderRefundReason;
		note?: string;
	}>;
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
	myOrderServices: (storeId?: number) =>
		["my-order-services", storeId ?? "all"] as const,
	dashboard: ["dashboard"] as const,
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
							...(query.status ? { status: query.status } : {}),
							...(query.payment_status
								? { payment_status: query.payment_status }
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
							...(query.status ? { status: query.status } : {}),
							...(query.payment_status
								? { payment_status: query.payment_status }
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

export async function fetchCampaignsPage(
	query?: FetchCampaignsQuery,
): Promise<PaginatedData<Campaign>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.campaigns.$get({
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
							...(query.is_active !== undefined
								? { is_active: String(query.is_active) }
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

export async function fetchMyOrderServices(storeId?: number) {
	return parseSuccessData<MyOrderServiceItem[]>(
		rpcWithAuth().api.admin.orders.services.me.$get({
			query: storeId !== undefined ? { store_id: String(storeId) } : {},
		}),
	);
}

export async function claimOrderService(orderId: number, serviceId: number) {
	return parseResponse(
		rpcWithAuth().api.admin.orders[":id"].services[":serviceId"].claim.$post({
			param: { id: String(orderId), serviceId: String(serviceId) },
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

export async function uploadFileToPresignedUrl(
	uploadUrl: string,
	file: File,
	contentType: PresignOrderServicePhotoPayload["content_type"],
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

export async function fetchDashboardCounts() {
	const [
		customers,
		users,
		stores,
		categories,
		services,
		products,
		paymentMethods,
		orders,
		campaigns,
	] = await Promise.all([
		fetchCustomers(),
		fetchUsers(),
		fetchStores(),
		fetchCategories(),
		fetchServices(),
		fetchProducts(),
		fetchPaymentMethods(),
		fetchOrders(),
		fetchCampaigns(),
	]);

	return {
		customers: customers.length,
		users: users.length,
		stores: stores.length,
		categories: categories.length,
		services: services.length,
		products: products.length,
		paymentMethods: paymentMethods.length,
		orders: orders.length,
		campaigns: campaigns.length,
	};
}
