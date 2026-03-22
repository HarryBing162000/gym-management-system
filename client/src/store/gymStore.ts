/**
 * gymStore.ts
 * IronCore GMS — Global Gym Settings Store
 *
 * Fetches and caches gym info + plans once on app load.
 * Plans are the SINGLE SOURCE OF TRUTH for pricing across the entire frontend.
 * No auth required — gym-info is a public endpoint.
 */

import { create } from "zustand";

export interface GymPlan {
  _id: string;
  name: string;
  price: number;
  durationMonths: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface WalkInPrices {
  regular: number;
  student: number;
  couple: number;
}

interface GymSettings {
  gymName: string;
  gymAddress: string;
  logoUrl: string | null;
  plans: GymPlan[];
  walkInPrices: WalkInPrices;
}

interface GymStore {
  settings: GymSettings | null;
  isLoading: boolean;
  hasFetched: boolean;

  // Actions
  fetchGymInfo: () => Promise<void>;
  updateSettings: (settings: Partial<GymSettings>) => void;
  setLogoUrl: (logoUrl: string | null) => void;
  setPlans: (plans: GymPlan[]) => void;
  setWalkInPrices: (prices: WalkInPrices) => void;

  // Plan helpers
  getActivePlans: () => GymPlan[];
  getPlanPrice: (planName: string) => number;
  getPlanDuration: (planName: string) => number;

  // Walk-in price helper
  getWalkInPrice: (passType: "regular" | "student" | "couple") => number;
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
            plans: data.settings.plans ?? [],
            walkInPrices: data.settings.walkInPrices ?? {
              regular: 150,
              student: 100,
              couple: 250,
            },
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

  // Called after owner adds/updates/deletes plans in settings
  setPlans: (plans) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, plans } : null,
    }));
  },

  // ── Plan helpers — used across all pages ────────────────────────────────────
  getActivePlans: () => {
    return get().settings?.plans?.filter((p) => p.isActive) ?? [];
  },

  getPlanPrice: (planName: string) => {
    const plan = get().settings?.plans?.find(
      (p) => p.name === planName && p.isActive,
    );
    return plan?.price ?? 0;
  },

  getPlanDuration: (planName: string) => {
    const plan = get().settings?.plans?.find(
      (p) => p.name === planName && p.isActive,
    );
    return plan?.durationMonths ?? 1;
  },

  // Called after owner updates walk-in prices in settings
  setWalkInPrices: (prices) => {
    set((state) => ({
      settings: state.settings
        ? { ...state.settings, walkInPrices: prices }
        : null,
    }));
  },

  // ── Walk-in price helper ────────────────────────────────────────────────────
  getWalkInPrice: (passType) => {
    const prices = get().settings?.walkInPrices;
    return (
      prices?.[passType] ??
      { regular: 150, student: 100, couple: 250 }[passType]
    );
  },
}));
