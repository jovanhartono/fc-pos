import type {
	POSTStoreDeviceSchema,
	POSTStoreSchema,
} from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import { parseSuccessData } from "@/lib/http";
import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type Store = InferResponseType<
	typeof rpc.api.admin.stores.$get
>["data"][number];

type StoreDevice = InferResponseType<
	(typeof rpc.api.admin.stores)[":id"]["devices"]["$get"]
>["data"][number];

export type CreateStorePayload = z.infer<typeof POSTStoreSchema>;
export type UpdateStorePayload = z.infer<typeof POSTStoreSchema>;
export type RegisterStoreDevicePayload = z.infer<typeof POSTStoreDeviceSchema>;

export const storesKeys = {
	all: ["stores"] as const,
	list: () => [...storesKeys.all, "list"] as const,
	devices: (storeId: number) =>
		[...storesKeys.all, storeId, "devices"] as const,
};

async function fetchStores() {
	const response = await parseResponse(rpcWithAuth().api.admin.stores.$get());
	return response.data;
}

function fetchStoreDevices(storeId: number) {
	return parseSuccessData<StoreDevice[]>(
		rpcWithAuth().api.admin.stores[":id"].devices.$get({
			param: { id: String(storeId) },
		}),
	);
}

export const storesQueries = {
	list: () =>
		queryOptions({
			queryKey: storesKeys.list(),
			queryFn: fetchStores,
			staleTime: REFERENCE_DATA_STALE_TIME,
		}),
	devices: (storeId: number) =>
		queryOptions({
			queryKey: storesKeys.devices(storeId),
			queryFn: () => fetchStoreDevices(storeId),
		}),
};

export function createStore(payload: CreateStorePayload) {
	return parseResponse(rpcWithAuth().api.admin.stores.$post({ json: payload }));
}

export function updateStore(id: number, payload: UpdateStorePayload) {
	return parseResponse(
		rpcWithAuth().api.admin.stores[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export function registerStoreDevice(
	storeId: number,
	payload: RegisterStoreDevicePayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin.stores[":id"].devices.$post({
			param: { id: String(storeId) },
			json: payload,
		}),
	);
}

export function deleteStoreDevice(storeId: number, deviceId: number) {
	return parseResponse(
		rpcWithAuth().api.admin.stores[":id"].devices[":deviceId"].$delete({
			param: { id: String(storeId), deviceId: String(deviceId) },
		}),
	);
}
