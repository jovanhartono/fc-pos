import type { InferResponseType } from "hono/client";

import { parseSuccessData } from "@/lib/http";
import { rpc } from "@/lib/rpc";

type LoginSuccessResponse = InferResponseType<typeof rpc.api.auth.login.$post>;

export interface LoginPayload {
  username: string;
  password: string;
}

export const login = (payload: LoginPayload) =>
  parseSuccessData<LoginSuccessResponse["data"]>(
    rpc.api.auth.login.$post({ json: payload })
  );

export const logout = () => rpc.api.auth.logout.$post();
