import type { POSTUserSchema, PUTUserSchema } from "@fresclean/api/schema";
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

export type User = InferResponseType<
	typeof rpc.api.admin.users.$get
>["data"][number];

export type Me = InferResponseType<typeof rpc.api.admin.users.me.$get>["data"];

export type FetchUsersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	is_active?: boolean;
	role?: "admin" | "cashier" | "worker" | "courier";
};

export type CreateUserPayload = z.infer<typeof POSTUserSchema>;
export type UpdateUserPayload = z.infer<typeof PUTUserSchema>;
export type UpdateUserStoresPayload = {
	store_ids: number[];
};

export const usersKeys = {
	all: ["users"] as const,
	lists: () => [...usersKeys.all, "list"] as const,
	list: (query?: FetchUsersQuery) =>
		[...usersKeys.lists(), query ?? {}] as const,
	me: () => [...usersKeys.all, "me"] as const,
};

async function fetchUsersPage(
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

	return toPaginated(response);
}

function fetchMe() {
	return parseSuccessData<Me>(rpcWithAuth().api.admin.users.me.$get());
}

export const usersQueries = {
	list: (query?: FetchUsersQuery) =>
		queryOptions({
			queryKey: usersKeys.list(query),
			queryFn: () => fetchUsersPage(query),
		}),
	me: () =>
		queryOptions({
			queryKey: usersKeys.me(),
			queryFn: fetchMe,
		}),
};

export function createUser(payload: CreateUserPayload) {
	return parseResponse(rpcWithAuth().api.admin.users.$post({ json: payload }));
}

export function updateUser(id: number, payload: UpdateUserPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.users[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export function updateUserStores(id: number, payload: UpdateUserStoresPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.users[":id"].stores.$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}
