import type { POSTPaymentMethodSchema } from "@fresclean/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import type { z } from "zod";
import { REFERENCE_DATA_STALE_TIME } from "@/lib/query-defaults";
import { type rpc, rpcWithAuth } from "@/lib/rpc";

export type PaymentMethod = InferResponseType<
	(typeof rpc.api.admin)["payment-methods"]["$get"]
>["data"][number];

export type CreatePaymentMethodPayload = z.infer<
	typeof POSTPaymentMethodSchema
>;
export type UpdatePaymentMethodPayload = z.infer<
	typeof POSTPaymentMethodSchema
>;

export const paymentMethodsKeys = {
	all: ["payment-methods"] as const,
	list: () => [...paymentMethodsKeys.all, "list"] as const,
};

async function fetchPaymentMethods() {
	const response = await parseResponse(
		rpcWithAuth().api.admin["payment-methods"].$get(),
	);
	return response.data;
}

export const paymentMethodsQueries = {
	list: () =>
		queryOptions({
			queryKey: paymentMethodsKeys.list(),
			queryFn: fetchPaymentMethods,
			staleTime: REFERENCE_DATA_STALE_TIME,
		}),
};

export function createPaymentMethod(payload: CreatePaymentMethodPayload) {
	return parseResponse(
		rpcWithAuth().api.admin["payment-methods"].$post({ json: payload }),
	);
}

export function updatePaymentMethod(
	id: number,
	payload: UpdatePaymentMethodPayload,
) {
	return parseResponse(
		rpcWithAuth().api.admin["payment-methods"][":id"].$put({
			param: { id: String(id) },
			json: payload,
		}),
	);
}
