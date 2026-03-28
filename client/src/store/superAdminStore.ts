/**
 * superAdminStore.ts
 * GMS — Super Admin Zustand Store
 *
 * Separate from authStore — super admin token never mixes
 * with owner/staff tokens.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SuperAdminState {
  token: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;

  setAuth: (token: string) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useSuperAdminStore = create<SuperAdminState>()(
  persist(
    (set) => ({
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setAuth: (token) => set({ token, isAuthenticated: true }),

      logout: () => set({ token: null, isAuthenticated: false }),

      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: "gms-superadmin",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
