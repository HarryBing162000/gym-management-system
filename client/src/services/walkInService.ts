import api from "./api";
import type {
  WalkInTodayResponse,
  WalkInRegisterPayload,
  WalkInRegisterResponse,
} from "../types";

export const walkInService = {
  // Register a walk-in (staff/owner) — now accepts "couple" pass type
  register: async (
    payload: WalkInRegisterPayload,
  ): Promise<WalkInRegisterResponse> => {
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

  // Kiosk self checkout (public — uses fetch directly in KioskPage, not axios)
  kioskCheckOut: async (walkId: string) => {
    const res = await api.post("/walkin/kiosk-checkout", { walkId });
    return res.data;
  },
};
