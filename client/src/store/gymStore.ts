/**
 * gymStore.ts
 * GMS — Global Gym Settings Store
 *
 * Fetches and caches gym info + plans once on app load.
 * Plans are the SINGLE SOURCE OF TRUTH for pricing across the entire frontend.
 * No auth required — gym-info is a public endpoint.
 *
 * Added: timezone field — replaces all hardcoded Asia/Manila in the frontend.
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
  closingTime: string; // "HH:mm" 24h format
  timezone: string; // IANA timezone string e.g. "Asia/Manila"
}

interface GymStore {
  settings: GymSettings | null;
  isLoading: boolean;
  hasFetched: boolean;

  // Member refresh signal
  lastMemberUpdate: number;
  triggerMemberRefresh: () => void;

  // Actions
  fetchGymInfo: () => Promise<void>;
  updateSettings: (settings: Partial<GymSettings>) => void;
  setLogoUrl: (logoUrl: string | null) => void;
  setPlans: (plans: GymPlan[]) => void;
  setWalkInPrices: (prices: WalkInPrices) => void;
  setClosingTime: (closingTime: string) => void;
  setTimezone: (timezone: string) => void;

  // Plan helpers
  getActivePlans: () => GymPlan[];
  getPlanPrice: (planName: string) => number;
  getPlanDuration: (planName: string) => number;

  // Walk-in price helper
  getWalkInPrice: (passType: "regular" | "student" | "couple") => number;

  // Timezone helper — use this everywhere instead of hardcoding "Asia/Manila"
  getTimezone: () => string;
}

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "http://localhost:5000/api";

export const useGymStore = create<GymStore>((set, get) => ({
  settings: null,
  isLoading: false,
  hasFetched: false,

  lastMemberUpdate: 0,
  triggerMemberRefresh: () => set({ lastMemberUpdate: Date.now() }),

  fetchGymInfo: async () => {
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
            closingTime: data.settings.closingTime ?? "22:00",
            timezone: data.settings.timezone ?? "Asia/Manila",
          },
          hasFetched: true,
        });
      }
    } catch {
      set({ hasFetched: true });
    } finally {
      set({ isLoading: false });
    }
  },

  updateSettings: (newSettings) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...newSettings } : null,
    }));
  },

  setLogoUrl: (logoUrl) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, logoUrl } : null,
    }));
  },

  setPlans: (plans) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, plans } : null,
    }));
  },

  setClosingTime: (closingTime) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, closingTime } : null,
    }));
  },

  setTimezone: (timezone) => {
    set((state) => ({
      settings: state.settings ? { ...state.settings, timezone } : null,
    }));
  },

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

  setWalkInPrices: (prices) => {
    set((state) => ({
      settings: state.settings
        ? { ...state.settings, walkInPrices: prices }
        : null,
    }));
  },

  getWalkInPrice: (passType) => {
    const prices = get().settings?.walkInPrices;
    return (
      prices?.[passType] ??
      { regular: 150, student: 100, couple: 250 }[passType]
    );
  },

  // Returns the gym's configured timezone, defaulting to Asia/Manila.
  // Use this everywhere instead of hardcoding the timezone string.
  getTimezone: () => {
    return get().settings?.timezone ?? "Asia/Manila";
  },
}));
