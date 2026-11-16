import { rpcFn } from "@fresclean/api/rpc";
import { API_BASE_URL } from "@/lib/rpc-public";
import { useAuthStore } from "@/stores/auth-store";

const authFetch: typeof fetch = async (input, init) => {
	// Local Vite and the API sit on different ports, so the session cookie only
	// travels when asked for; deployed they share one origin.
	const response = await fetch(input, { ...init, credentials: "include" });

	if (response.status === 401) {
		useAuthStore.getState().clearUser();
	}

	return response;
};

export const rpc = rpcFn(API_BASE_URL, { fetch: authFetch });
