import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../types";
import api from "../services/api";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        // Grab BEFORE clearing — once set() runs the token is gone
        const { user, token } = get();

        if (user && token) {
          // Pass the token explicitly in the header so it doesn't depend
          // on the axios interceptor reading from store state
          api
            .post(
              "/action-logs/logout",
              {},
              { headers: { Authorization: `Bearer ${token}` } },
            )
            .catch(() => {
              // Non-critical — never block logout
            });
        }

        // Clear state AFTER the request is fired (fire-and-forget)
        set({ user: null, token: null, isAuthenticated: false });
      },

      setHasHydrated: (state) => {
        set({ _hasHydrated: state });
      },
    }),
    {
      name: "gms-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
