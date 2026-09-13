import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { parseSuccessData } from "@/lib/http";
import { rpcPublic } from "@/lib/rpc-public";

export type PublicTrackedOrder = InferResponseType<
	typeof rpcPublic.api.public.orders.track.$post
>["data"];

export type TrackPublicOrderPayload = {
	code: string;
	phone_number: string;
};

export const trackKeys = {
	all: ["publicTrackOrder"] as const,
	order: (code?: string, phoneNumber?: string) =>
		[...trackKeys.all, code, phoneNumber] as const,
};

export async function trackPublicOrder(payload: TrackPublicOrderPayload) {
	return parseSuccessData<PublicTrackedOrder>(
		rpcPublic.api.public.orders.track.$post({ json: payload }),
	);
}

export const trackQueries = {
	order: (code?: string, phoneNumber?: string) =>
		queryOptions({
			queryKey: trackKeys.order(code, phoneNumber),
			queryFn: () =>
				trackPublicOrder({
					code: code ?? "",
					phone_number: phoneNumber ?? "",
				}),
			retry: false,
			refetchOnWindowFocus: false,
			staleTime: 0,
		}),
};
