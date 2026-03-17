import api from "./api";
import type { WalkInTodayResponse } from "../types";

export const walkInService = {
  // Register a walk-in (staff/owner)
  register: async (payload: {
    name: string;
    phone?: string;
    passType: "regular" | "student";
  }) => {
    const res = await api.post("/walkin/register", payload);
    return res.data;
  },

  // Get today's walk-ins + summary
  getToday: async (): Promise<WalkInTodayResponse> => {
    const res = await api.get("/walkin/today");
    return res.data;
  },

  // Staff checkout
  checkOut: async (walkId: string) => {
    const res = await api.patch("/walkin/checkout", { walkId });
    return res.data;
  },

  // Kiosk self checkout (public)
  kioskCheckOut: async (walkId: string) => {
    const res = await api.post("/walkin/kiosk-checkout", { walkId });
    return res.data;
  },
};
