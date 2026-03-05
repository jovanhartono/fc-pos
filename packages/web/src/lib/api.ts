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

export interface ApiSuccess<T> {
	success: true;
	message?: string;
	data: T;
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
const storesRoute = rpc.api.admin.stores.$get;
const categoriesRoute = rpc.api.admin.categories.$get;
const servicesRoute = rpc.api.admin.services.$get;
const productsRoute = rpc.api.admin.products.$get;
const paymentMethodsRoute = rpc.api.admin["payment-methods"].$get;
const ordersRoute = rpc.api.admin.orders.$get;

type LoginSuccessResponse = Extract<
	InferResponseType<typeof loginRoute>,
	{ success: true }
>;

export type Customer = InferResponseType<typeof customersRoute>["data"][number];
export type User = InferResponseType<typeof usersRoute>["data"][number];
export type Store = InferResponseType<typeof storesRoute>["data"][number];
export type Category = InferResponseType<
	typeof categoriesRoute
>["data"][number];
export type Service = InferResponseType<typeof servicesRoute>["data"][number];
export type Product = InferResponseType<typeof productsRoute>["data"][number];
export type PaymentMethod = InferResponseType<
	typeof paymentMethodsRoute
>["data"][number];
export type Order = InferResponseType<typeof ordersRoute>["data"][number];

export type LoginPayload = {
	username: string;
	password: string;
};

export type CreateCustomerPayload = z.infer<typeof POSTCustomerSchema>;
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

export const queryKeys = {
	customers: ["customers"] as const,
	users: ["users"] as const,
	stores: ["stores"] as const,
	categories: ["categories"] as const,
	services: ["services"] as const,
	products: ["products"] as const,
	paymentMethods: ["payment-methods"] as const,
	orders: ["orders"] as const,
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

export async function fetchUsers() {
	const response = await parseResponse(rpcWithAuth().api.admin.users.$get());
	return response.data;
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

export async function fetchOrders() {
	const response = await parseResponse(rpcWithAuth().api.admin.orders.$get());
	return response.data;
}

export async function createCustomer(payload: CreateCustomerPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.customers.$post({ json: payload }),
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
	] = await Promise.all([
		fetchCustomers(),
		fetchUsers(),
		fetchStores(),
		fetchCategories(),
		fetchServices(),
		fetchProducts(),
		fetchPaymentMethods(),
		fetchOrders(),
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
	};
}
