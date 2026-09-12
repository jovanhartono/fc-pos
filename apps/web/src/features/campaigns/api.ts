import type {
	CampaignPayloadSchema,
	CampaignUpdatePayloadSchema,
} from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import { parseSuccessData, toSearchParams } from "@/lib/http";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

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

export type FetchCampaignsQuery = {
	store_id?: number;
	is_active?: boolean;
};

export type CampaignPayload = z.output<typeof CampaignPayloadSchema>;
export type UpdateCampaignPayload = z.output<
	typeof CampaignUpdatePayloadSchema
>;

export type ResolveVoucherCodePayload = {
	code: string;
	store_id: number;
	gross_total: number;
};

export const campaignsKeys = {
	all: ["campaigns"] as const,
	lists: () => [...campaignsKeys.all, "list"] as const,
	list: (query?: FetchCampaignsQuery) =>
		[...campaignsKeys.lists(), query ?? {}] as const,
	detail: (id: number) => [...campaignsKeys.all, "detail", id] as const,
	voucherCodes: (id: number) => [...campaignsKeys.detail(id), "codes"] as const,
};

async function fetchCampaigns(query?: FetchCampaignsQuery) {
	const response = await parseResponse(
		rpcWithAuth().api.admin.campaigns.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);
	return response.data;
}

function fetchCampaignVoucherCodes(campaignId: number) {
	return parseSuccessData<VoucherCodesResponse>(
		rpcWithAuth().api.admin.campaigns[":id"].codes.$get({
			param: { id: String(campaignId) },
		}),
	);
}

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
};

export function createCampaign(payload: CampaignPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.campaigns.$post({ json: payload }),
	);
}

export function updateCampaign(id: number, payload: UpdateCampaignPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.campaigns[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}

export function resolveVoucherCode(payload: ResolveVoucherCodePayload) {
	return parseSuccessData<ResolvedVoucher>(
		rpcWithAuth().api.admin.campaigns["resolve-code"].$post({ json: payload }),
	);
}
