import type { JWTPayload } from "@fresclean/api/types";
import { jwtDecode } from "jwt-decode";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
	token: string | null;
	setToken: (token: string) => void;
	clearToken: () => void;
}

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

	try {
		return jwtDecode<JWTPayload>(token);
	} catch {
		return null;
	}
}
