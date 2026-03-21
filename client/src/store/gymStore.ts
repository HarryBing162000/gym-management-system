/**
 * gymStore.ts
 * IronCore GMS — Global Gym Settings Store
 *
 * Fetches and caches gym info (name, address, logoUrl) once on app load.
 * Used by all components that need to display the gym name or logo.
 * No auth required — gym-info is a public endpoint.
 */

import { create } from "zustand";

interface GymSettings {
  gymName: string;
  gymAddress: string;
  logoUrl: string | null;
}

interface GymStore {
  settings: GymSettings | null;
  isLoading: boolean;
  hasFetched: boolean;

  // Actions
  fetchGymInfo: () => Promise<void>;
  updateSettings: (settings: Partial<GymSettings>) => void;
  setLogoUrl: (logoUrl: string | null) => void;
}

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "http://localhost:5000/api";

export const useGymStore = create<GymStore>((set, get) => ({
  settings: null,
  isLoading: false,
  hasFetched: false,

  fetchGymInfo: async () => {
    // Don't fetch again if already fetched
    if (get().hasFetched) return;

    set({ isLoading: true });
    try {
      const res = await fetch(`${API_BASE}/auth/gym-info`);
      const data = await res.json();

      if (data.success) {
        set({
          settings: {
            gymName: data.settings.gymName,
            gymAddress: data.settings.gymAddress,
            logoUrl: data.settings.logoUrl || null,
          },
          hasFetched: true,
        });
      }
    } catch {
      // Fail silently — fallback to default text in components
      set({ hasFetched: true });
    } finally {
      set({ isLoading: false });
    }
  },

  // Called after owner updates gym name/address in settings modal
  updateSettings: (newSettings) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...newSettings } : null,
    }));
  },

  // Called after owner uploads or deletes logo
  setLogoUrl: (logoUrl) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, logoUrl } : null,
    }));
  },
}));
