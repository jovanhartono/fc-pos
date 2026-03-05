import { rpcFn } from "@fresclean/api/rpc";
import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/";

export const rpc = rpcFn(API_BASE_URL);

export const rpcWithAuth = () => {
	const token = useAuthStore.getState().token;

	return rpcFn(API_BASE_URL, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
};
