import type {
  PATCHOwnProfileSchema,
  POSTUserSchema,
  PUTOwnPasswordSchema,
  PUTUserPasswordSchema,
  PUTUserSchema,
} from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { z } from "zod";

import type { PhotoUploader } from "@/features/orders/utils/photo-upload";
import {
  parseSuccessData,
  toPaginated,
  toSearchParams,
  uploadFileToPresignedUrl,
} from "@/lib/http";
import type { PaginatedData } from "@/lib/http";
import {
  REFERENCE_DATA_STALE_TIME,
  REPORT_STALE_TIME,
  SESSION_DATA_STALE_TIME,
} from "@/lib/query-defaults";
import { rpc } from "@/lib/rpc";

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

export interface FetchUsersQuery {
  limit?: number;
  offset?: number;
  search?: string;
  is_active?: boolean;
}

export type CreateUserPayload = z.infer<typeof POSTUserSchema>;
export type UpdateUserPayload = z.infer<typeof PUTUserSchema>;
export interface UpdateUserStoresPayload {
  store_ids: number[];
}
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

const fetchUsersPage = async (
  query?: FetchUsersQuery
): Promise<PaginatedData<User>> => {
  const response = await parseResponse(
    rpc.api.admin.users.$get({
      query:
        query && Object.keys(query).length > 0
          ? toSearchParams(query)
          : undefined,
    })
  );

  return toPaginated(response);
};

const fetchMe = () => parseSuccessData<Me>(rpc.api.admin.users.me.$get());

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
          rpc.api.admin.users.me.performance.$get({
            query: { period },
          })
        ),
      staleTime: REPORT_STALE_TIME,
    }),
  couriers: () =>
    queryOptions({
      queryKey: usersKeys.couriers(),
      queryFn: () =>
        parseSuccessData<Courier[]>(rpc.api.admin.users.couriers.$get()),
      staleTime: REFERENCE_DATA_STALE_TIME,
    }),
};

export const createUser = (payload: CreateUserPayload) =>
  parseResponse(rpc.api.admin.users.$post({ json: payload }));

export const updateUser = (id: number, payload: UpdateUserPayload) =>
  parseResponse(
    rpc.api.admin.users[":id"].$put({
      param: { id: String(id) },
      json: payload,
    })
  );

export const resetUserPassword = (
  id: number,
  payload: ResetUserPasswordPayload
) =>
  parseResponse(
    rpc.api.admin.users[":id"].password.$put({
      param: { id: String(id) },
      json: payload,
    })
  );

export const updateOwnProfile = (payload: UpdateOwnProfilePayload) =>
  parseResponse(rpc.api.admin.users.me.$patch({ json: payload }));

export const changeOwnPassword = (payload: ChangeOwnPasswordPayload) =>
  parseResponse(rpc.api.admin.users.me.password.$put({ json: payload }));

export const avatarUploader: PhotoUploader = {
  pushBytes: async ({ file, contentType, signal }) => {
    const presigned = await parseSuccessData<{
      key: string;
      upload_url: string;
    }>(
      rpc.api.admin.users.me.avatar.presign.$post({
        json: { content_type: contentType },
      })
    );
    await uploadFileToPresignedUrl(
      presigned.upload_url,
      file,
      contentType,
      signal
    );
    return presigned.key;
  },
  commit: async (key) => {
    await parseResponse(
      rpc.api.admin.users.me.avatar.$put({
        json: { image_path: key },
      })
    );
  },
};

export const removeAvatar = () =>
  parseResponse(rpc.api.admin.users.me.avatar.$delete());

export const updateUserStores = (
  id: number,
  payload: UpdateUserStoresPayload
) =>
  parseResponse(
    rpc.api.admin.users[":id"].stores.$put({
      param: { id: String(id) },
      json: payload,
    })
  );
