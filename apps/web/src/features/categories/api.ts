import type { POSTCategorySchema } from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type Category = InferResponseType<
	typeof rpc.api.admin.categories.$get
>["data"][number];

export type CreateCategoryPayload = z.infer<typeof POSTCategorySchema>;
export type UpdateCategoryPayload = z.infer<typeof POSTCategorySchema>;

export const categoriesKeys = {
	all: ["categories"] as const,
	list: () => [...categoriesKeys.all, "list"] as const,
};

async function fetchCategories() {
	const response = await parseResponse(
		rpcWithAuth().api.admin.categories.$get(),
	);
	return response.data;
}

export const categoriesQueries = {
	list: () =>
		queryOptions({
			queryKey: categoriesKeys.list(),
			queryFn: fetchCategories,
			staleTime: REFERENCE_DATA_STALE_TIME,
		}),
};

export function createCategory(payload: CreateCategoryPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.categories.$post({ json: payload }),
	);
}

export function updateCategory(id: number, payload: UpdateCategoryPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.categories[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}
