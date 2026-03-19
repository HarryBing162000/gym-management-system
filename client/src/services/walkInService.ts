import api from "./api";
import type {
  WalkInTodayResponse,
  WalkInRegisterPayload,
  WalkInRegisterResponse,
} from "../types";

interface WalkInHistoryResponse extends WalkInTodayResponse {
  total: number;
  page: number;
  totalPages: number;
}

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

  // Get walk-in history (owner only) — by date or last 7 days
  getHistory: async (
    params?: Record<string, string | number>,
  ): Promise<WalkInHistoryResponse> => {
    const res = await api.get("/walkin/history", { params });
    return res.data;
  },

  // Yesterday's revenue — for comparison card
  getYesterdayRevenue: async (): Promise<{
    success: boolean;
    date: string;
    revenue: number;
    total: number;
  }> => {
    const res = await api.get("/walkin/yesterday-revenue");
    return res.data;
  },

  // Kiosk self checkout (public — uses fetch directly in KioskPage, not axios)
  kioskCheckOut: async (walkId: string) => {
    const res = await api.post("/walkin/kiosk-checkout", { walkId });
    return res.data;
  },
};
