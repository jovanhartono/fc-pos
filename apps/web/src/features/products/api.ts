import type { POSTProductSchema } from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type Product = InferResponseType<
	typeof rpc.api.admin.products.$get
>["data"][number];

// Money crosses the wire as the digit string the currency field produced; the
// server is what turns it into a number. So these payloads are the schema's
// input side, not its parsed output.
export type CreateProductPayload = z.input<typeof POSTProductSchema>;
export type UpdateProductPayload = z.input<typeof POSTProductSchema>;

export const productsKeys = {
	all: ["products"] as const,
	list: () => [...productsKeys.all, "list"] as const,
};

async function fetchProducts() {
	const response = await parseResponse(rpcWithAuth().api.admin.products.$get());
	return response.data;
}

export const productsQueries = {
	list: () =>
		queryOptions({
			queryKey: productsKeys.list(),
			queryFn: fetchProducts,
			staleTime: REFERENCE_DATA_STALE_TIME,
		}),
};

export function createProduct(payload: CreateProductPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.products.$post({ json: payload }),
	);
}

export function updateProduct(id: number, payload: UpdateProductPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.products[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}
