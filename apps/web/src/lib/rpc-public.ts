import { rpcFn } from "@fresclean/api/rpc";

export const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/";

export const rpcPublic = rpcFn(API_BASE_URL);
