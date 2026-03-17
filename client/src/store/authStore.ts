import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../types";

// 🧠 Think of this like a global variable that any component can read
// persist means it saves to localStorage so user stays logged in on refresh

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // Actions
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      // Called after successful login
      setAuth: (user, token) => {
        localStorage.setItem("token", token);
        set({ user, token, isAuthenticated: true });
      },

      // Called on logout
      logout: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: "ironcore-auth", // localStorage key
    },
  ),
);
