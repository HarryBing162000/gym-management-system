import api from "./api";
import type {
  Member,
  MembersResponse,
  CreateMemberPayload,
  UpdateMemberPayload,
} from "../types";

export interface AtRiskMember {
  gymId: string;
  name: string;
  plan: string;
  expiresAt: string;
  daysLeft: number;
  status: "expiring" | "overdue";
}

export const memberService = {
  // GET /api/members — list with optional filters
  getAll: async (params?: {
    status?: string;
    plan?: string;
    search?: string;
    checkedIn?: string;
    page?: number;
    limit?: number;
  }): Promise<MembersResponse> => {
    const res = await api.get("/members", { params });
    return res.data;
  },

  // GET /api/members/stats — dashboard summary counts
  getMemberStats: async (): Promise<{
    total: number;
    checkedIn: number;
    expiringSoon: number;
    withBalance: number;
  }> => {
    const res = await api.get("/members/stats");
    return res.data;
  },

  // GET /api/members/at-risk — expiring/overdue members
  getAtRiskMembers: async (): Promise<{ atRisk: AtRiskMember[] }> => {
    const res = await api.get("/members/at-risk");
    return res.data;
  },

  // GET /api/members/:gymId — single member
  getByGymId: async (
    gymId: string,
  ): Promise<{ success: boolean; member: Member }> => {
    const res = await api.get(`/members/${gymId}`);
    return res.data;
  },

  // POST /api/members — create member
  create: async (
    payload: CreateMemberPayload,
  ): Promise<{ success: boolean; message: string; member: Member }> => {
    const res = await api.post("/members", payload);
    return res.data;
  },

  // PATCH /api/members/:gymId — update fields
  update: async (
    gymId: string,
    payload: UpdateMemberPayload,
  ): Promise<{ success: boolean; message: string; member: Member }> => {
    const res = await api.patch(`/members/${gymId}`, payload);
    return res.data;
  },

  // PATCH /api/members/:gymId — renew membership (update + payment info)
  renew: async (
    gymId: string,
    payload: {
      plan: string;
      expiresAt: string;
      paymentMethod: "cash" | "online";
      amountPaid: number;
      totalAmount?: number;
      status: string;
    },
  ): Promise<{ success: boolean; message: string; member: Member }> => {
    const res = await api.patch(`/members/${gymId}`, payload);
    return res.data;
  },

  // PATCH /api/members/:gymId/deactivate — soft delete (owner only)
  deactivate: async (
    gymId: string,
  ): Promise<{ success: boolean; message: string; member: Member }> => {
    const res = await api.patch(`/members/${gymId}/deactivate`);
    return res.data;
  },

  // PATCH /api/members/:gymId/reactivate — restore (owner only)
  reactivate: async (
    gymId: string,
  ): Promise<{ success: boolean; message: string; member: Member }> => {
    const res = await api.patch(`/members/${gymId}/reactivate`);
    return res.data;
  },

  // PATCH /api/members/:gymId/checkin — staff desk check-in
  checkIn: async (
    gymId: string,
  ): Promise<{
    success: boolean;
    message: string;
    member: { gymId: string; name: string; checkedIn: boolean };
  }> => {
    const res = await api.patch(`/members/${gymId}/checkin`);
    return res.data;
  },

  // PATCH /api/members/:gymId/checkout — staff desk check-out
  checkOut: async (
    gymId: string,
  ): Promise<{
    success: boolean;
    message: string;
    member: { gymId: string; name: string; checkedIn: boolean };
  }> => {
    const res = await api.patch(`/members/${gymId}/checkout`);
    return res.data;
  },
};
