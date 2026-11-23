import type {
  CampaignPayloadSchema,
  CampaignUpdatePayloadSchema,
} from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { z } from "zod";

import { parseSuccessData, toSearchParams } from "@/lib/http";
import { rpc } from "@/lib/rpc";

export type Campaign = InferResponseType<
  typeof rpc.api.admin.campaigns.$get
>["data"][number];

export type ResolvedVoucher = InferResponseType<
  (typeof rpc.api.admin.campaigns)["resolve-code"]["$post"]
>["data"];

type VoucherCodesResponse = InferResponseType<
  (typeof rpc.api.admin.campaigns)[":id"]["codes"]["$get"]
>["data"];

export type VoucherCode = VoucherCodesResponse["codes"][number];

export interface FetchCampaignsQuery {
  store_id?: number;
  is_active?: boolean;
}

export type CampaignPayload = z.output<typeof CampaignPayloadSchema>;
export type UpdateCampaignPayload = z.output<
  typeof CampaignUpdatePayloadSchema
>;

export interface ResolveVoucherCodePayload {
  code: string;
  store_id: number;
  gross_total: number;
  service_ids: number[];
}

export const campaignsKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignsKeys.all, "list"] as const,
  list: (query?: FetchCampaignsQuery) =>
    [...campaignsKeys.lists(), query ?? {}] as const,
  detail: (id: number) => [...campaignsKeys.all, "detail", id] as const,
  voucherCodes: (id: number) => [...campaignsKeys.detail(id), "codes"] as const,
  liveVoucher: (storeId: number) =>
    [...campaignsKeys.all, "live-voucher", storeId] as const,
};

const fetchCampaigns = async (query?: FetchCampaignsQuery) => {
  const response = await parseResponse(
    rpc.api.admin.campaigns.$get({
      query:
        query && Object.keys(query).length > 0
          ? toSearchParams(query)
          : undefined,
    })
  );
  return response.data;
};

const fetchCampaignVoucherCodes = (campaignId: number) =>
  parseSuccessData<VoucherCodesResponse>(
    rpc.api.admin.campaigns[":id"].codes.$get({
      param: { id: String(campaignId) },
    })
  );

export const campaignsQueries = {
  list: (query?: FetchCampaignsQuery) =>
    queryOptions({
      queryKey: campaignsKeys.list(query),
      queryFn: () => fetchCampaigns(query),
    }),
  voucherCodes: (campaignId: number) =>
    queryOptions({
      queryKey: campaignsKeys.voucherCodes(campaignId),
      queryFn: () => fetchCampaignVoucherCodes(campaignId),
    }),
  liveVoucher: (storeId: number) =>
    queryOptions({
      queryKey: campaignsKeys.liveVoucher(storeId),
      queryFn: () =>
        parseSuccessData<{ has_live_voucher: boolean }>(
          rpc.api.admin.campaigns["live-voucher"].$get({
            query: { store_id: String(storeId) },
          })
        ),
    }),
};

export const createCampaign = (payload: CampaignPayload) =>
  parseResponse(rpc.api.admin.campaigns.$post({ json: payload }));

export const updateCampaign = (id: number, payload: UpdateCampaignPayload) =>
  parseResponse(
    rpc.api.admin.campaigns[":id"].$put({
      param: { id: String(id) },
      json: payload,
    })
  );

export const resolveVoucherCode = (payload: ResolveVoucherCodePayload) =>
  parseSuccessData<ResolvedVoucher>(
    rpc.api.admin.campaigns["resolve-code"].$post({ json: payload })
  );
