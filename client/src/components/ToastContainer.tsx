/**
 * ToastContainer.tsx
 * IronCore GMS — Global Toast Notification Renderer
 *
 * Mount once in App.tsx — renders all toasts via portal.
 * Toasts stack vertically from the bottom center.
 */

import { createPortal } from "react-dom";
import { useToastStore } from "../store/toastStore";
import type { ToastType } from "../store/toastStore";

const TOAST_STYLES: Record<
  ToastType,
  {
    bg: string;
    border: string;
    text: string;
    icon: React.ReactNode;
  }
> = {
  success: {
    bg: "bg-[#1a2a1a]",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="#22c55e" strokeWidth="1.5" />
        <path
          d="M4.5 8l2.5 2.5 4.5-4.5"
          stroke="#22c55e"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  error: {
    bg: "bg-[#2a1a1a]",
    border: "border-red-500/30",
    text: "text-red-400",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
        <path
          d="M5 5l6 6M11 5l-6 6"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  warning: {
    bg: "bg-[#2a2210]",
    border: "border-amber-500/30",
    text: "text-amber-400",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 2L14.5 13H1.5L8 2z"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8 6.5v3"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11" r="0.75" fill="#f59e0b" />
      </svg>
    ),
  },
  info: {
    bg: "bg-[#141e2a]",
    border: "border-blue-500/30",
    text: "text-blue-400",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="#60a5fa" strokeWidth="1.5" />
        <path
          d="M8 7v4"
          stroke="#60a5fa"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="5" r="0.75" fill="#60a5fa" />
      </svg>
    ),
  },
};

function ToastItem({
  id,
  message,
  type,
}: {
  id: string;
  message: string;
  type: ToastType;
}) {
  const { removeToast } = useToastStore();
  const s = TOAST_STYLES[type];

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl min-w-70 max-w-sm ${s.bg} ${s.border}`}
      style={{ animation: "toastSlideIn 0.25s ease" }}>
      <div className="shrink-0 mt-0.5">{s.icon}</div>
      <span className={`flex-1 text-sm font-medium leading-snug ${s.text}`}>
        {message}
      </span>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 text-white/20 hover:text-white/50 transition-colors mt-0.5 cursor-pointer">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 2l8 8M10 2l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToastStore();
  if (toasts.length === 0) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center"
        style={{ pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: "auto" }}>
            <ToastItem id={t.id} message={t.message} type={t.type} />
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
