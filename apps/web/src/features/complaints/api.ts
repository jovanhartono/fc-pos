import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferResponseType } from "hono/client";

import { parseSuccessData, toPaginated, toSearchParams } from "@/lib/http";
import type { PaginatedData } from "@/lib/http";
import { rpc } from "@/lib/rpc";

export type ComplaintListItem = InferResponseType<
  typeof rpc.api.admin.complaints.$get
>["data"][number];

export type ComplaintDetail = InferResponseType<
  (typeof rpc.api.admin.complaints)[":id"]["$get"]
>["data"];

export interface FetchComplaintsQuery {
  store_id?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface OpenComplaintPayload {
  order_service_id: number;
  reason: string;
  start_rework?: boolean;
}

export const complaintsKeys = {
  all: ["complaints"] as const,
  lists: () => [...complaintsKeys.all, "list"] as const,
  list: (query?: FetchComplaintsQuery) =>
    [...complaintsKeys.lists(), query ?? {}] as const,
  detail: (id: number) => [...complaintsKeys.all, "detail", id] as const,
};

const fetchComplaintsPage = async (
  query?: FetchComplaintsQuery
): Promise<PaginatedData<ComplaintListItem>> => {
  const response = await parseResponse(
    rpc.api.admin.complaints.$get({
      query:
        query && Object.keys(query).length > 0
          ? toSearchParams(query)
          : undefined,
    })
  );

  return toPaginated(response);
};

const fetchComplaintDetail = (id: number) =>
  parseSuccessData<ComplaintDetail>(
    rpc.api.admin.complaints[":id"].$get({
      param: { id: String(id) },
    })
  );

export const complaintsQueries = {
  list: (query?: FetchComplaintsQuery) =>
    queryOptions({
      queryKey: complaintsKeys.list(query),
      queryFn: () => fetchComplaintsPage(query),
    }),
  detail: (id: number) =>
    queryOptions({
      queryKey: complaintsKeys.detail(id),
      queryFn: () => fetchComplaintDetail(id),
    }),
};

export const openComplaint = (payload: OpenComplaintPayload) =>
  parseResponse(rpc.api.admin.complaints.$post({ json: payload }));

export const addComplaintRework = (complaintId: number) =>
  parseResponse(
    rpc.api.admin.complaints[":id"].rework.$post({
      param: { id: String(complaintId) },
    })
  );
