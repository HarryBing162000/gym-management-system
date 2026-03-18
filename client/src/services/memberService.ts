import api from "./api";
import type {
  Member,
  MembersResponse,
  CreateMemberPayload,
  UpdateMemberPayload,
} from "../types";

export const memberService = {
  // GET /api/members — list with optional filters
  getAll: async (params?: {
    status?: string;
    plan?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<MembersResponse> => {
    const res = await api.get("/members", { params });
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
};
