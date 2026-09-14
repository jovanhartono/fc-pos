import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import {
	type PaginatedData,
	parseSuccessData,
	toPaginated,
	toSearchParams,
} from "@/lib/http";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type ComplaintListItem = InferResponseType<
	typeof rpc.api.admin.complaints.$get
>["data"][number];

export type ComplaintDetail = InferResponseType<
	(typeof rpc.api.admin.complaints)[":id"]["$get"]
>["data"];

export type FetchComplaintsQuery = {
	store_id?: number;
	search?: string;
	limit?: number;
	offset?: number;
};

export type OpenComplaintPayload = {
	order_service_id: number;
	reason: string;
	start_rework?: boolean;
};

export const complaintsKeys = {
	all: ["complaints"] as const,
	lists: () => [...complaintsKeys.all, "list"] as const,
	list: (query?: FetchComplaintsQuery) =>
		[...complaintsKeys.lists(), query ?? {}] as const,
	detail: (id: number) => [...complaintsKeys.all, "detail", id] as const,
};

async function fetchComplaintsPage(
	query?: FetchComplaintsQuery,
): Promise<PaginatedData<ComplaintListItem>> {
	const response = await parseResponse(
		rpcWithAuth().api.admin.complaints.$get({
			query:
				query && Object.keys(query).length > 0
					? toSearchParams(query)
					: undefined,
		}),
	);

	return toPaginated(response);
}

function fetchComplaintDetail(id: number) {
	return parseSuccessData<ComplaintDetail>(
		rpcWithAuth().api.admin.complaints[":id"].$get({
			param: { id: String(id) },
		}),
	);
}

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

export function openComplaint(payload: OpenComplaintPayload) {
	return parseResponse(
		rpcWithAuth().api.admin.complaints.$post({ json: payload }),
	);
}

export function addComplaintRework(complaintId: number) {
	return parseResponse(
		rpcWithAuth().api.admin.complaints[":id"].rework.$post({
			param: { id: String(complaintId) },
		}),
	);
}
