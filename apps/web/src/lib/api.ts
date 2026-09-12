import type { InferResponseType } from "hono/client";
import { parseSuccessData } from "@/lib/http";
import { rpc } from "@/lib/rpc";

type LoginSuccessResponse = InferResponseType<typeof rpc.api.auth.login.$post>;

export type LoginPayload = {
	username: string;
	password: string;
};

export type PublicTrackedOrder = InferResponseType<
	typeof rpc.api.public.orders.track.$post
>["data"];

export type TrackPublicOrderPayload = {
	code: string;
	phone_number: string;
};

export async function login(payload: LoginPayload) {
	return parseSuccessData<LoginSuccessResponse["data"]>(
		rpc.api.auth.login.$post({ json: payload }),
	);
}

export async function trackPublicOrder(payload: TrackPublicOrderPayload) {
	return parseSuccessData<PublicTrackedOrder>(
		rpc.api.public.orders.track.$post({ json: payload }),
	);
}
