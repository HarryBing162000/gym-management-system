import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;

  // Actions
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      // Called after successful login
      // Zustand persist handles localStorage — no manual setItem needed
      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true });
      },

      // Called on logout
      // Zustand persist clears its own key — no manual removeItem needed
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },

      setHasHydrated: (state) => {
        set({ _hasHydrated: state });
      },
    }),
    {
      name: "ironcore-auth",
      onRehydrateStorage: () => (state) => {
        // Mark hydration complete so ProtectedRoute doesn't flash to /login
        state?.setHasHydrated(true);
      },
    },
  ),
);
