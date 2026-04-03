import axios from "axios";
import { useAuthStore } from "../store/authStore";

// Base axios instance — all requests go through here
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ Request interceptor
// Reads token from Zustand store — single source of truth
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ Response interceptor
// On 401 — log out and redirect ONLY for protected routes.
// Login endpoints also return 401 (wrong credentials) — must NOT
// redirect there or the error message never shows on the login page.
//
// Impersonation sessions: if the current user has impersonated: true,
// show a friendly "support session ended" message and clear the
// impersonation banner flag. Regular sessions show the server message
// (e.g. gym suspended, account deactivated).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRoute = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRoute) {
      const message: string = error.response?.data?.message ?? "";
      const isImpersonating = !!useAuthStore.getState().user?.impersonated;

      if (isImpersonating) {
        // Support session expired — show a clear message and clean up
        // the impersonation flag so the banner doesn't linger after login.
        sessionStorage.setItem(
          "gms:logout-reason",
          "Support session ended. You have been signed out.",
        );
        sessionStorage.removeItem("gms:impersonating");
      } else if (message) {
        // Normal forced-logout (suspended gym, deactivated account, etc.)
        // Persist across the redirect — LoginPage reads and clears this.
        sessionStorage.setItem("gms:logout-reason", message);
      }

      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
