import { rpcFn } from "@fresclean/api/rpc";
import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/";

const authFetch: typeof fetch = async (input, init) => {
	const response = await fetch(input, init);

	if (response.status === 401) {
		const { token, clearToken } = useAuthStore.getState();
		if (token) {
			clearToken();
			if (typeof window !== "undefined") {
				const loginPath = "/auth/login";
				if (window.location.pathname !== loginPath) {
					window.location.assign(loginPath);
				}
			}
		}
	}

	return response;
};

export const rpc = rpcFn(API_BASE_URL, { fetch: authFetch });

export const rpcWithAuth = () => {
	const token = useAuthStore.getState().token;

	return rpcFn(API_BASE_URL, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
		fetch: authFetch,
	});
};
