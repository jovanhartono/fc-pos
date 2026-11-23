import type { JWTPayload } from "@fresclean/api/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// The sign-in itself lives in an HttpOnly cookie no script can read. This is
// only who signed in, for showing names and choosing screens.
interface AuthState {
  user: JWTPayload | null;
  setUser: (user: JWTPayload) => void;
  clearUser: () => void;
}

// Tokens from before the cookie sat readable in localStorage; drop the copy so
// it can't be lifted.
try {
  localStorage.removeItem("jwt");
} catch {
  // Storage blocked
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: "auth-user",
    }
  )
);

// Every tab shares the one cookie. When a cashier signs out and the next person
// signs in on one tab, the others reload as them, dropping the open sheet and
// cart; a tab whose own sign-in ends starts over on Sign In.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === useAuthStore.persist.getOptions().name) {
      window.location.reload();
    }
  });
  useAuthStore.subscribe((state, previous) => {
    const isPublicPage = window.location.pathname.startsWith("/track");
    if (previous.user && !state.user && !isPublicPage) {
      window.location.assign("/auth/login");
    }
  });
}

export const getCurrentUser = (): JWTPayload | null =>
  useAuthStore.getState().user;
