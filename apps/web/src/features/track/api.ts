import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { parseSuccessData } from "@/lib/http";
import { hasQris } from "@/lib/qris";
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

export type TrackCharge = NonNullable<PublicTrackedOrder["open_charge"]>;

// Same proof as tracking; answers with the QRIS to show, or DOKU's QRIS page
// to go to while its SNAP keys are missing.
export function payTrackedOrder(payload: TrackPublicOrderPayload) {
	return parseSuccessData<TrackCharge>(
		rpcPublic.api.public.orders.pay.$post({ json: payload }),
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
			// While a QR is up, so Paid shows within seconds: SNAP QRIS sends no
			// webhook, and this read is what asks DOKU.
			refetchInterval: (query) =>
				hasQris(query.state.data?.open_charge) ? 5000 : false,
		}),
};
