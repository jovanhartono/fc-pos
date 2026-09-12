import { rpcFn } from "@fresclean/api/rpc";

export const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/";

// The client for endpoints nobody signs in for. A customer checking their order
// on /track loads this and nothing that knows about sign-in.
export const rpcPublic = rpcFn(API_BASE_URL);
