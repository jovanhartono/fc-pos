import type { JWTPayload } from "@fresclean/api/types";
import { jwtDecode } from "jwt-decode";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
	token: string | null;
	setToken: (token: string) => void;
	clearToken: () => void;
}

let cachedToken: string | null = null;
let cachedUser: JWTPayload | null = null;

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			token: null,
			setToken: (token) => set({ token }),
			clearToken: () => set({ token: null }),
		}),
		{
			name: "jwt",
		},
	),
);

export function getCurrentUser(): JWTPayload | null {
	const token = useAuthStore.getState().token;
	if (!token) {
		return null;
	}

	if (token === cachedToken) {
		return cachedUser;
	}

	try {
		const user = jwtDecode<JWTPayload>(token);
		cachedToken = token;
		cachedUser = user;
		return user;
	} catch {
		return null;
	}
}
