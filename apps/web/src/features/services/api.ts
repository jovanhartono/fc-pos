import type { POSTServiceSchema } from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type Service = InferResponseType<
	typeof rpc.api.admin.services.$get
>["data"][number];

// Money crosses the wire as the digit string the currency field produced; the
// server is what turns it into a number. So these payloads are the schema's
// input side, not its parsed output.
export type CreateServicePayload = z.input<typeof POSTServiceSchema>;
export type UpdateServicePayload = z.input<typeof POSTServiceSchema>;

export const servicesKeys = {
	all: ["services"] as const,
	list: () => [...servicesKeys.all, "list"] as const,
};

async function fetchServices() {
	const response = await parseResponse(rpcWithAuth().api.admin.services.$get());
	return response.data;
}

export const servicesQueries = {
	list: () =>
		queryOptions({
			queryKey: servicesKeys.list(),
			queryFn: fetchServices,
			staleTime: REFERENCE_DATA_STALE_TIME,
		}),
};

export function createService(payload: CreateServicePayload) {
	return parseResponse(
		rpcWithAuth().api.admin.services.$post({ json: payload }),
	);
}

export function updateService(id: number, payload: UpdateServicePayload) {
	return parseResponse(
		rpcWithAuth().api.admin.services[":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}
