import api from "./api";

export interface StaffMember {
  _id: string;
  name: string;
  username: string;
  isActive: boolean;
  createdAt: string;
}

export const staffService = {
  getAll: async (): Promise<StaffMember[]> => {
    const res = await api.get("/auth/staff");
    return res.data.staff;
  },

  create: async (payload: {
    name: string;
    username: string;
    password: string;
    role: "staff";
  }): Promise<StaffMember> => {
    const res = await api.post("/auth/register/staff", payload);
    return res.data.user;
  },

  deactivate: async (id: string): Promise<StaffMember> => {
    const res = await api.patch(`/auth/staff/${id}/deactivate`);
    return res.data.staff;
  },

  reactivate: async (id: string): Promise<StaffMember> => {
    const res = await api.patch(`/auth/staff/${id}/reactivate`);
    return res.data.staff;
  },
};
