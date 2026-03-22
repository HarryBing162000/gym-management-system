/**
 * ConfirmModal.tsx
 * GMS — Shared confirmation modal for destructive / important actions.
 *
 * Use for:
 *   - Deactivate member        (danger)
 *   - Check out walk-in        (warning)
 *   - Delete / remove anything (danger)
 *   - Logout                   (already handled in layouts)
 *
 * Do NOT use for:
 *   - Save / update forms  (just save — easily re-edited)
 *   - Add new member       (no harm if accidental)
 *   - Record payment       (common daily action)
 */

import { createPortal } from "react-dom";

interface ConfirmModalProps {
  /** Modal title — keep it short e.g. "Deactivate member?" */
  title: string;
  /** Supporting message — explain what will happen */
  message: string;
  /** Label for the confirm button */
  confirmLabel: string;
  /** Red styling for irreversible/destructive actions. Amber for recoverable ones. */
  variant?: "danger" | "warning";
  /** Called when user clicks the confirm button */
  onConfirm: () => void;
  /** Called when user clicks Cancel or the backdrop */
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const isDanger = variant === "danger";

  const iconColor = isDanger ? "#ef4444" : "#f59e0b";
  const iconBg = isDanger
    ? "bg-red-500/10 border-red-500/20"
    : "bg-amber-500/10 border-amber-500/20";
  const btnClass = isDanger
    ? "bg-red-500 hover:bg-red-400 text-white"
    : "bg-amber-500 hover:bg-amber-400 text-black";

  return createPortal(
    <>
      <style>{`
        @keyframes gmsFadeIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onCancel}
      >
        <div
          className="w-full max-w-xs bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl"
          style={{ animation: "gmsFadeIn 0.2s ease" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div
            className={`w-14 h-14 rounded-full border flex items-center justify-center mx-auto mb-4 ${iconBg}`}
          >
            {isDanger ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                  stroke={iconColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  stroke={iconColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="12"
                  y1="9"
                  x2="12"
                  y2="13"
                  stroke={iconColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="12"
                  y1="17"
                  x2="12.01"
                  y2="17"
                  stroke={iconColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>

          {/* Text */}
          <div className="text-center mb-5">
            <div className="text-white font-bold text-base mb-1">{title}</div>
            <div className="text-white/40 text-sm leading-relaxed">
              {message}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer ${btnClass}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
