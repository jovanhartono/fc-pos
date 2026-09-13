import type { InferResponseType } from "hono/client";
import { parseSuccessData } from "@/lib/http";
import { rpc } from "@/lib/rpc";

type LoginSuccessResponse = InferResponseType<typeof rpc.api.auth.login.$post>;

export type LoginPayload = {
	username: string;
	password: string;
};

export async function login(payload: LoginPayload) {
	return parseSuccessData<LoginSuccessResponse["data"]>(
		rpc.api.auth.login.$post({ json: payload }),
	);
}
