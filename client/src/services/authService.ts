import api from "./api";
import type {
  LoginOwnerPayload,
  LoginStaffPayload,
  AuthResponse,
} from "../types";
import type { User } from "../types";

export const authService = {
  // Owner login — email + password
  loginOwner: async (payload: LoginOwnerPayload): Promise<AuthResponse> => {
    const res = await api.post("/auth/login/owner", payload);
    return res.data;
  },

  // Staff login — username + password
  loginStaff: async (payload: LoginStaffPayload): Promise<AuthResponse> => {
    const res = await api.post("/auth/login/staff", payload);
    return res.data;
  },

  // Get current logged in user
  getMe: async (): Promise<{ success: boolean; user: User }> => {
    const res = await api.get("/auth/me");
    return res.data;
  },

  // Logout — clears local storage
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  },
};
