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
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRoute = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRoute) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
