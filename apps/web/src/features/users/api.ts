import type {
	PATCHOwnProfileSchema,
	POSTUserSchema,
	PUTOwnPasswordSchema,
	PUTUserPasswordSchema,
	PUTUserSchema,
} from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import {
	type InferRequestType,
	type InferResponseType,
	parseResponse,
} from "hono/client";
import type { z } from "zod";
import type { PhotoUploader } from "@/features/orders/utils/photo-upload";
import {
	type PaginatedData,
	parseSuccessData,
	toPaginated,
	toSearchParams,
	uploadFileToPresignedUrl,
} from "@/lib/http";
import {
	REFERENCE_DATA_STALE_TIME,
	REPORT_STALE_TIME,
	SESSION_DATA_STALE_TIME,
} from "@/lib/query-defaults";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type User = InferResponseType<
	typeof rpc.api.admin.users.$get
>["data"][number];

export type Courier = InferResponseType<
	typeof rpc.api.admin.users.couriers.$get
>["data"][number];

export type Me = InferResponseType<typeof rpc.api.admin.users.me.$get>["data"];

export type OwnPerformance = InferResponseType<
	typeof rpc.api.admin.users.me.performance.$get
>["data"];

export type PerformancePeriod = InferRequestType<
	typeof rpc.api.admin.users.me.performance.$get
>["query"]["period"];

export type UpdateOwnProfilePayload = z.infer<typeof PATCHOwnProfileSchema>;
export type ChangeOwnPasswordPayload = z.infer<typeof PUTOwnPasswordSchema>;

export type FetchUsersQuery = {
	limit?: number;
	offset?: number;
	search?: string;
	is_active?: boolean;
};

export type CreateUserPayload = z.infer<typeof POSTUserSchema>;
export type UpdateUserPayload = z.infer<typeof PUTUserSchema>;
export type UpdateUserStoresPayload = {
	store_ids: number[];
};
export type ResetUserPasswordPayload = z.infer<typeof PUTUserPasswordSchema>;

export const usersKeys = {
	all: ["users"] as const,
	lists: () => [...usersKeys.all, "list"] as const,
	list: (query?: FetchUsersQuery) =>
		[...usersKeys.lists(), query ?? {}] as const,
	me: () => [...usersKeys.all, "me"] as const,
	performance: (period: PerformancePeriod) =>
		[...usersKeys.me(), "performance", period] as const,
	couriers: () => [...usersKeys.all, "couriers"] as const,
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
			staleTime: SESSION_DATA_STALE_TIME,
		}),
	performance: (period: PerformancePeriod) =>
		queryOptions({
			queryKey: usersKeys.performance(period),
			queryFn: () =>
				parseSuccessData<OwnPerformance>(
					rpcWithAuth().api.admin.users.me.performance.$get({
						query: { period },
					}),
				),
			staleTime: REPORT_STALE_TIME,
		}),
	couriers: () =>
		queryOptions({
			queryKey: usersKeys.couriers(),
			queryFn: () =>
				parseSuccessData<Courier[]>(
					rpcWithAuth().api.admin.users.couriers.$get(),
				),
			staleTime: REFERENCE_DATA_STALE_TIME,
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

export function resetUserPassword(
	id: number,
	payload: ResetUserPasswordPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.users[":id"].password.$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export function updateOwnProfile(payload: UpdateOwnProfilePayload) {
	return parseResponse(
		rpcWithAuth().api.admin.users.me.$patch({ json: payload }),
	);
}

export function changeOwnPassword(payload: ChangeOwnPasswordPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.users.me.password.$put({ json: payload }),
	);
}

export const avatarUploader: PhotoUploader = {
	pushBytes: async ({ file, contentType, signal }) => {
		const presigned = await parseSuccessData<{
			key: string;
			upload_url: string;
		}>(
			rpcWithAuth().api.admin.users.me.avatar.presign.$post({
				json: { content_type: contentType },
			}),
		);
		await uploadFileToPresignedUrl(
			presigned.upload_url,
			file,
			contentType,
			signal,
		);
		return presigned.key;
	},
	commit: async (key) => {
		await parseResponse(
			rpcWithAuth().api.admin.users.me.avatar.$put({
				json: { image_path: key },
			}),
		);
	},
};

export function removeAvatar() {
	return parseResponse(rpcWithAuth().api.admin.users.me.avatar.$delete());
}

export function updateUserStores(id: number, payload: UpdateUserStoresPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.users[":id"].stores.$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}
