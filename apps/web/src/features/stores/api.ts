import type {
  POSTStoreDeviceSchema,
  POSTStoreSchema,
} from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { z } from "zod";

import { parseSuccessData } from "@/lib/http";
import { SESSION_DATA_STALE_TIME } from "@/lib/query-defaults";
import { rpc } from "@/lib/rpc";

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

const fetchStores = async () => {
  const response = await parseResponse(rpc.api.admin.stores.$get());
  return response.data;
};

const fetchStoreDevices = (storeId: number) =>
  parseSuccessData<StoreDevice[]>(
    rpc.api.admin.stores[":id"].devices.$get({
      param: { id: String(storeId) },
    })
  );

export const storesQueries = {
  list: () =>
    queryOptions({
      queryKey: storesKeys.list(),
      queryFn: fetchStores,
      staleTime: SESSION_DATA_STALE_TIME,
      gcTime: SESSION_DATA_STALE_TIME,
    }),
  devices: (storeId: number) =>
    queryOptions({
      queryKey: storesKeys.devices(storeId),
      queryFn: () => fetchStoreDevices(storeId),
    }),
};

export const createStore = (payload: CreateStorePayload) =>
  parseResponse(rpc.api.admin.stores.$post({ json: payload }));

export const updateStore = (id: number, payload: UpdateStorePayload) =>
  parseResponse(
    rpc.api.admin.stores[":id"].$put({
      param: { id: String(id) },
      json: payload,
    })
  );

export const registerStoreDevice = (
  storeId: number,
  payload: RegisterStoreDevicePayload
) =>
  parseResponse(
    rpc.api.admin.stores[":id"].devices.$post({
      param: { id: String(storeId) },
      json: payload,
    })
  );

export const deleteStoreDevice = (storeId: number, deviceId: number) =>
  parseResponse(
    rpc.api.admin.stores[":id"].devices[":deviceId"].$delete({
      param: { id: String(storeId), deviceId: String(deviceId) },
    })
  );
