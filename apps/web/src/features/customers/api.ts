import type {
	POSTCustomerSchema,
	PUTCustomerSchema,
} from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import {
	type PaginatedData,
	parseSuccessData,
	toPaginated,
	toSearchParams,
} from "@/lib/http";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type Customer = InferResponseType<
	typeof rpc.api.admin.customers.$get
>["data"][number];

type CustomerLookup = InferResponseType<
	typeof rpc.api.admin.customers.lookup.$get
>["data"];

// The person plus the money and history behind them. Admin-only (ADR-0021).
export type CustomerDetail = InferResponseType<
	(typeof rpc.api.admin.customers)[":id"]["$get"]
>["data"];

export type FetchCustomersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
};

export type CreateCustomerPayload = Omit<
	z.infer<typeof POSTCustomerSchema>,
	"origin_store_id"
> & {
	origin_store_id?: number;
};
export type UpdateCustomerPayload = z.infer<typeof PUTCustomerSchema>;

export const customersKeys = {
	all: ["customers"] as const,
	lists: () => [...customersKeys.all, "list"] as const,
	list: (query?: FetchCustomersQuery) =>
		[...customersKeys.lists(), query ?? {}] as const,
	byPhone: (phone: string) =>
		[...customersKeys.all, "by-phone", phone] as const,
	detail: (id: number) => [...customersKeys.all, "detail", id] as const,
};

async function fetchCustomersPage(
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

	return toPaginated(response);
}

// The cashier types a phone at the POS and the name fills in. A convenience only:
// checkout still finds or creates the Customer by phone (ADR-0011).
function fetchCustomerByPhone(phone: string): Promise<CustomerLookup> {
	return parseSuccessData<CustomerLookup>(
		rpcWithAuth().api.admin.customers.lookup.$get({ query: { phone } }),
	);
}

function fetchCustomerDetail(id: number): Promise<CustomerDetail> {
	return parseSuccessData<CustomerDetail>(
		rpcWithAuth().api.admin.customers[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

export const customersQueries = {
	list: (query?: FetchCustomersQuery) =>
		queryOptions({
			queryKey: customersKeys.list(query),
			queryFn: () => fetchCustomersPage(query),
		}),
	byPhone: (phone: string) =>
		queryOptions({
			queryKey: customersKeys.byPhone(phone),
			queryFn: () => fetchCustomerByPhone(phone),
			// A cashier flipping between cart and payment remounts the phone field;
			// reusing the answer keeps the name from flashing.
			staleTime: 5 * 60 * 1000,
		}),
	detail: (id: number) =>
		queryOptions({
			queryKey: customersKeys.detail(id),
			queryFn: () => fetchCustomerDetail(id),
		}),
};

export function createCustomer(payload: CreateCustomerPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.customers.$post({
			json: payload as z.infer<typeof POSTCustomerSchema>,
		}),
	);
}

export function updateCustomer(id: number, payload: UpdateCustomerPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.customers[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}
