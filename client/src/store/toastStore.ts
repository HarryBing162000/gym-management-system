/**
 * toastStore.ts
 * IronCore GMS — Global Toast Notification Store
 *
 * Usage anywhere in the app:
 *   const { showToast } = useToastStore();
 *   showToast("Member saved.", "success");
 *   showToast("Duplicate name.", "error");
 *   showToast("Already exists.", "warning");
 *   showToast("Checking...", "info");
 */

import { create } from "zustand";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message, type = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    // Auto-remove after duration based on type
    const duration = type === "error" || type === "warning" ? 6000 : 4000;
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
