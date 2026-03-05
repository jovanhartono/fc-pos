import { redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";

export const requireAuth = () => {
	if (!useAuthStore.getState().token) {
		throw redirect({ to: "/auth/login" });
	}
};
