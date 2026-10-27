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

export type PaymentGatewayInfo = InferResponseType<
	(typeof rpc.api.admin)["payment-gateway"]["$get"]
>["data"];

// Linking or unlinking a PaymentMethod changes the gateway answer too, so both
// sit under the same prefix.
export const paymentMethodsKeys = {
	all: ["payment-methods"] as const,
	list: () => [...paymentMethodsKeys.all, "list"] as const,
	gateway: () => [...paymentMethodsKeys.all, "gateway"] as const,
};

async function fetchPaymentMethods() {
	const response = await parseResponse(
		rpcWithAuth().api.admin["payment-methods"].$get(),
	);
	return response.data;
}

async function fetchPaymentGateway() {
	const response = await parseResponse(
		rpcWithAuth().api.admin["payment-gateway"].$get(),
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
	gateway: () =>
		queryOptions({
			queryKey: paymentMethodsKeys.gateway(),
			queryFn: fetchPaymentGateway,
			staleTime: REFERENCE_DATA_STALE_TIME,
		}),
};

export const GATEWAY_LABELS: Record<
	NonNullable<PaymentGatewayInfo["gateway"]>,
	string
> = {
	midtrans: "Midtrans",
	doku: "DOKU",
};

// Online payment is on only when the server names a gateway and its linked
// PaymentMethod is active.
export const isOnlinePaymentReady = (info: PaymentGatewayInfo | undefined) =>
	Boolean(info?.gateway && info.payment_method);

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
