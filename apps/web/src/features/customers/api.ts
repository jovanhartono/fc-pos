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

// Leaner than Customer — the lookup omits the originStore relation (the POS
// prefill reads only the name). 0-or-1, so the data is the row or null.
type CustomerLookup = InferResponseType<
	typeof rpc.api.admin.customers.lookup.$get
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
	byPhone: (phone: string) => ["customer-by-phone", phone] as const,
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

// Exact-phone lookup for the POS name-prefill. Returns the matching customer or
// null — phone is identity, so 0-or-1. UX-only; checkout still find-or-creates
// by phone server-side (ADR-0011).
function fetchCustomerByPhone(phone: string): Promise<CustomerLookup> {
	return parseSuccessData<CustomerLookup>(
		rpcWithAuth().api.admin.customers.lookup.$get({ query: { phone } }),
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
			// A phone→customer mapping is stable; cache it so re-looking-up the same
			// phone (e.g. after a cart↔payment tab toggle remounts the field) is
			// instant instead of refetching and flashing the name/badge.
			staleTime: 5 * 60 * 1000,
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
