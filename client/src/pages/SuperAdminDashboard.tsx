/**
 * SuperAdminDashboard.tsx
 * GMS — Super Admin Dashboard
 *
 * UX improvements applied:
 * - billingRenewsAt date picker in drawer (for recording client payments)
 * - "Never logged in" amber badge on rows
 * - Trial expiry ⚠ badge on rows (within 7 days)
 * - Escape key closes drawer
 * - "/" key focuses search
 * - Welcome modal on every login session (dismissed via sessionStorage)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdminStore } from "../store/superAdminStore";
import ConfirmModal from "../components/ConfirmModal";
import { createPortal } from "react-dom";
import { useIdleTimeout } from "../hooks/useIdleTimeout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GymClient {
  _id: string;
  gymClientId: string;
  gymName: string;
  gymAddress?: string;
  contactEmail: string;
  contactPhone?: string;
  status: "active" | "suspended" | "deleted";
  billingStatus: "trial" | "paid" | "overdue" | "cancelled";
  trialEndsAt?: string;
  billingRenewsAt?: string;
  notes?: string;
  lastLoginAt?: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ─── Stat card metadata ───────────────────────────────────────────────────────
const STAT_ICONS: Record<string, string> = {
  "Total Gyms": "🏢",
  Active: "✅",
  Suspended: "⏸",
  "On Trial": "🕐",
  Paid: "💳",
  "Expiring Soon": "⚠️",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  suspended: "#f59e0b",
  deleted: "#ef4444",
};

const BILLING_COLORS: Record<string, string> = {
  trial: "#60a5fa",
  paid: "#22c55e",
  overdue: "#ef4444",
  cancelled: "#6b7280",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso?: string): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function toDateInput(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toISOString().split("T")[0];
}

// ─── Clipboard helper ─────────────────────────────────────────────────────────
function copyToClipboard(text: string, onDone: () => void) {
  navigator.clipboard
    .writeText(text)
    .then(onDone)
    .catch(() => {});
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-[#212121] border border-white/10 rounded-xl p-4 animate-pulse">
      <div className="h-2.5 w-12 bg-white/10 rounded mb-3" />
      <div className="h-7 w-8 bg-white/10 rounded" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 md:gap-0 px-5 py-4 border-b border-white/5 animate-pulse">
      {[60, 140, 60, 60, 80, 60].map((w, i) => (
        <div key={i} className="flex items-center">
          <div className="h-3 bg-white/8 rounded" style={{ width: w }} />
        </div>
      ))}
    </div>
  );
}

// ─── Welcome Modal ────────────────────────────────────────────────────────────
// Shown once per login session. sessionStorage flag prevents re-showing
// if the SA navigates away and back within the same session.

function WelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  const now = new Date().toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });

  return createPortal(
    <>
      <style>{`
        @keyframes welcomeFadeIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
        onClick={onDismiss}
      >
        <div
          className="w-full max-w-xs bg-[#1e1e1e] border border-white/10 rounded-2xl p-7 shadow-2xl text-center"
          style={{ animation: "welcomeFadeIn 0.25s ease" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-[#FFB800]/10 border border-[#FFB800]/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚡</span>
          </div>

          {/* Text */}
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#FFB800] mb-1">
            Super Admin
          </div>
          <div className="text-white font-black text-lg mb-1">Welcome back</div>
          <div className="text-white/30 text-xs mb-5">
            GMS Control Panel &nbsp;·&nbsp; {now}
          </div>

          {/* Divider */}
          <div className="border-t border-white/7 mb-5" />

          {/* Reminder */}
          <div className="bg-amber-400/8 border border-amber-400/20 rounded-xl px-4 py-3 mb-5">
            <p className="text-amber-400 text-[11px] font-semibold leading-relaxed">
              You have full access to all gym accounts. Handle with care.
            </p>
          </div>

          <button
            onClick={onDismiss}
            className="w-full py-2.5 bg-[#FFB800] text-black text-sm font-black rounded-xl hover:bg-[#ffc933] active:scale-95 transition-all cursor-pointer"
          >
            Enter Dashboard ➜
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Idle Warning Modal ──────────────────────────────────────────────────────
// Shows a countdown 60 seconds before auto-logout due to inactivity.
// Any activity (mouse/key/click) resets the timer and hides this modal.

function IdleWarningModal({
  secondsLeft,
  onStayLoggedIn,
}: {
  secondsLeft: number;
  onStayLoggedIn: () => void;
}) {
  return createPortal(
    <>
      <style>{`
        @keyframes idleFadeIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
        <div
          className="w-full max-w-xs bg-[#1e1e1e] border border-amber-500/30 rounded-2xl p-7 shadow-2xl text-center"
          style={{ animation: "idleFadeIn 0.2s ease" }}
        >
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⏱</span>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">
            Session Expiring
          </div>
          <div className="text-white font-black text-lg mb-1">Still there?</div>
          <div className="text-white/40 text-xs mb-4 leading-relaxed">
            You've been inactive. Your session will end in
          </div>

          {/* Countdown */}
          <div
            className="text-5xl font-black mb-4 tabular-nums"
            style={{
              color: secondsLeft <= 10 ? "#ef4444" : "#f59e0b",
            }}
          >
            {secondsLeft}
          </div>

          <div className="text-white/20 text-xs mb-5">seconds</div>

          <button
            onClick={onStayLoggedIn}
            className="w-full py-2.5 bg-[#FFB800] text-black text-sm font-black rounded-xl hover:bg-[#ffc933] active:scale-95 transition-all cursor-pointer"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Create Gym Modal ─────────────────────────────────────────────────────────

function CreateGymModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [billingStatus, setBillingStatus] = useState("trial");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleCreate = async () => {
    setErrorMsg("");
    if (!gymName.trim()) {
      setErrorMsg("Gym name is required.");
      return;
    }
    if (!ownerName.trim()) {
      setErrorMsg("Owner name is required.");
      return;
    }
    if (!ownerEmail.trim()) {
      setErrorMsg("Owner email is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/superadmin/gyms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gymName: gymName.trim(),
          gymAddress: gymAddress.trim(),
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim(),
          contactPhone: contactPhone.trim(),
          billingStatus,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.message || "Failed to create gym.");
        return;
      }
      onCreated();
      onClose();
    } catch {
      setErrorMsg("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ animation: "saFadeIn 0.25s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#FFB800] mb-0.5">
              New Gym Client
            </div>
            <div className="text-white font-bold text-base">
              Create Gym + Owner
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white flex items-center justify-center text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-xs">{errorMsg}</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 pt-1">
            Gym Info
          </div>
          <input
            type="text"
            value={gymName}
            onChange={(e) => setGymName(e.target.value)}
            placeholder="Gym Name *"
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#FFB800] transition-colors"
          />
          <input
            type="text"
            value={gymAddress}
            onChange={(e) => setGymAddress(e.target.value)}
            placeholder="Address (optional)"
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#FFB800] transition-colors"
          />

          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 pt-2">
            Owner Info
          </div>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Owner Full Name *"
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#FFB800] transition-colors"
          />
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="Owner Email * (invite will be sent here)"
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#FFB800] transition-colors"
          />
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="Contact Phone (optional)"
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#FFB800] transition-colors"
          />

          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 pt-2">
            Billing Status
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["trial", "paid", "overdue", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setBillingStatus(s)}
                className={`py-2 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${billingStatus === s ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]" : "border-white/10 text-white/30 hover:text-white/60"}`}
              >
                {s}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes (optional)"
            rows={2}
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#FFB800] transition-colors resize-none"
          />
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 py-2.5 bg-[#FFB800] text-black text-sm font-bold rounded-lg hover:bg-[#ffc933] transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Creating..." : "Create & Send Invite ➜"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Gym Detail / Edit Drawer ─────────────────────────────────────────────────

function GymDetailDrawer({
  gym,
  token,
  onClose,
  onRefresh,
  onToast,
}: {
  gym: GymClient;
  token: string;
  onClose: () => void;
  onRefresh: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const [notes, setNotes] = useState(gym.notes ?? "");
  const [billingStatus, setBillingStatus] = useState(gym.billingStatus);
  const [billingRenewsAt, setBillingRenewsAt] = useState(
    toDateInput(gym.billingRenewsAt),
  );
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: "danger" | "warning";
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const doAction = async (method: string, path: string, body?: object) => {
    setActionLoading(path);
    try {
      const res = await fetch(`${API}/api/superadmin/gyms/${gym._id}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onToast(data.message || "Action failed.", "error");
        return;
      }
      onToast(data.message, "success");
      onRefresh();
      onClose();
    } catch {
      onToast("Connection failed.", "error");
    } finally {
      setActionLoading("");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/superadmin/gyms/${gym._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notes,
          billingStatus,
          billingRenewsAt: billingRenewsAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onToast(data.message || "Save failed.", "error");
        return;
      }
      onToast("Gym updated.", "success");
      onRefresh();
    } catch {
      onToast("Connection failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleImpersonate = async () => {
    setImpersonateLoading(true);
    try {
      const res = await fetch(
        `${API}/api/superadmin/gyms/${gym._id}/impersonate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        onToast(
          data.message || "Failed to generate impersonation link.",
          "error",
        );
        return;
      }
      const url = `${window.location.origin}/impersonate?token=${data.impersonateToken}`;
      window.location.href = url;
    } catch {
      onToast("Connection failed.", "error");
    } finally {
      setImpersonateLoading(false);
    }
  };

  const trialDays = daysUntil(gym.trialEndsAt);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-end p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl h-full max-h-[90vh] overflow-y-auto flex flex-col gap-4"
        style={{ animation: "saSlideIn 0.25s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#FFB800] mb-0.5">
              {gym.gymClientId}
            </div>
            <div className="text-white font-bold text-base leading-tight">
              {gym.gymName}
            </div>
            <div className="text-xs text-white/40 mt-0.5">
              {gym.contactEmail}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#2a2a2a] rounded-lg p-3">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
              Status
            </div>
            <span
              className="text-xs font-bold uppercase"
              style={{ color: STATUS_COLORS[gym.status] }}
            >
              {gym.status}
            </span>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
              Billing
            </div>
            <span
              className="text-xs font-bold uppercase"
              style={{ color: BILLING_COLORS[billingStatus] }}
            >
              {billingStatus}
            </span>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
              Last Login
            </div>
            {!gym.lastLoginAt ? (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400">
                Never
              </span>
            ) : (
              <span className="text-xs text-white/60">
                {timeAgo(gym.lastLoginAt)}
              </span>
            )}
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
              Joined
            </div>
            <span className="text-xs text-white/60">
              {formatDate(gym.createdAt)}
            </span>
          </div>
          {gym.trialEndsAt && (
            <div className="bg-[#2a2a2a] rounded-lg p-3 col-span-2">
              <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
                Trial Ends
              </div>
              <span
                className="text-xs font-semibold"
                style={{
                  color:
                    trialDays !== null && trialDays <= 0
                      ? "#ef4444"
                      : trialDays !== null && trialDays <= 7
                        ? "#f59e0b"
                        : "#60a5fa",
                }}
              >
                {formatDate(gym.trialEndsAt)}
                {trialDays !== null && trialDays <= 0 && " — Expired"}
                {trialDays !== null &&
                  trialDays > 0 &&
                  trialDays <= 7 &&
                  ` — ${trialDays}d left`}
              </span>
            </div>
          )}
          {gym.billingRenewsAt && (
            <div className="bg-[#2a2a2a] rounded-lg p-3 col-span-2">
              <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
                Billing Renews
              </div>
              <span className="text-xs text-white/60">
                {formatDate(gym.billingRenewsAt)}
              </span>
            </div>
          )}
        </div>

        {/* Billing editor */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
            Billing Status
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(["trial", "paid", "overdue", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setBillingStatus(s)}
                className={`py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${billingStatus === s ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]" : "border-white/10 text-white/30 hover:text-white/60"}`}
              >
                {s}
              </button>
            ))}
          </div>
          {billingStatus === "paid" && (
            <div style={{ marginTop: "10px" }}>
              <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
                Next Renewal Date
              </div>
              <input
                type="date"
                value={billingRenewsAt}
                onChange={(e) => setBillingRenewsAt(e.target.value)}
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#FFB800] transition-colors"
                style={{ colorScheme: "dark" }}
              />
              <div className="text-[10px] text-white/20 mt-1">
                Set this when recording a client's monthly payment
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
            Internal Notes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes about this gym..."
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors resize-none"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-2 py-2 bg-[#FFB800]/15 border border-[#FFB800]/30 text-[#FFB800] text-xs font-bold rounded-lg hover:bg-[#FFB800]/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Actions */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
            Actions
          </div>
          <div className="space-y-2">
            {gym.status === "active" && (
              <button
                onClick={() =>
                  setConfirm({
                    title: `Log in as "${gym.gymName}"?`,
                    message:
                      "You will be logged into this gym's owner account for a 4-hour support session. Your Super Admin session will end.",
                    confirmLabel: "Start Session",
                    variant: "warning",
                    onConfirm: () => {
                      setConfirm(null);
                      handleImpersonate();
                    },
                  })
                }
                disabled={impersonateLoading || !!actionLoading}
                className="w-full py-2.5 text-xs font-semibold text-[#FF6B1A] bg-[#FF6B1A]/10 border border-[#FF6B1A]/30 rounded-lg hover:bg-[#FF6B1A]/15 transition-all disabled:opacity-50 cursor-pointer"
              >
                {impersonateLoading
                  ? "Starting session..."
                  : "👤 Log in as Owner"}
              </button>
            )}
            <button
              onClick={() =>
                setConfirm({
                  title: "Resend invite email?",
                  message: `Send a new set-password link to ${gym.contactEmail}.`,
                  confirmLabel: "Resend",
                  variant: "warning",
                  onConfirm: () => {
                    setConfirm(null);
                    doAction("POST", "/resend-invite");
                  },
                })
              }
              disabled={!!actionLoading}
              className="w-full py-2.5 text-xs font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-lg hover:bg-blue-400/15 transition-all disabled:opacity-50 cursor-pointer"
            >
              {actionLoading === "/resend-invite"
                ? "Sending..."
                : "📧 Resend Invite Email"}
            </button>
            <button
              onClick={() =>
                setConfirm({
                  title: "Send password reset?",
                  message: `A reset link will be emailed to ${gym.contactEmail}. It expires in 1 hour.`,
                  confirmLabel: "Send Reset",
                  variant: "warning",
                  onConfirm: () => {
                    setConfirm(null);
                    doAction("POST", "/reset-password");
                  },
                })
              }
              disabled={!!actionLoading}
              className="w-full py-2.5 text-xs font-semibold text-[#FFB800] bg-[#FFB800]/10 border border-[#FFB800]/20 rounded-lg hover:bg-[#FFB800]/15 transition-all disabled:opacity-50 cursor-pointer"
            >
              {actionLoading === "/reset-password"
                ? "Sending..."
                : "🔑 Send Password Reset"}
            </button>
            {gym.status === "active" ? (
              <button
                onClick={() =>
                  setConfirm({
                    title: `Suspend "${gym.gymName}"?`,
                    message:
                      "The owner will be deactivated and unable to log in until you reactivate the gym.",
                    confirmLabel: "Suspend",
                    variant: "warning",
                    onConfirm: () => {
                      setConfirm(null);
                      doAction("PATCH", "/suspend");
                    },
                  })
                }
                disabled={!!actionLoading}
                className="w-full py-2.5 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg hover:bg-amber-400/15 transition-all disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "/suspend"
                  ? "Suspending..."
                  : "⚠️ Suspend Gym"}
              </button>
            ) : gym.status === "suspended" ? (
              <button
                onClick={() =>
                  setConfirm({
                    title: `Reactivate "${gym.gymName}"?`,
                    message:
                      "The owner will regain access and can log in immediately.",
                    confirmLabel: "Reactivate",
                    variant: "warning",
                    onConfirm: () => {
                      setConfirm(null);
                      doAction("PATCH", "/reactivate");
                    },
                  })
                }
                disabled={!!actionLoading}
                className="w-full py-2.5 text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg hover:bg-emerald-400/15 transition-all disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "/reactivate"
                  ? "Reactivating..."
                  : "✓ Reactivate Gym"}
              </button>
            ) : null}
            <button
              onClick={() =>
                setConfirm({
                  title: `Delete "${gym.gymName}"?`,
                  message:
                    "This will permanently deactivate the gym and its owner. This action cannot be undone.",
                  confirmLabel: "Delete Gym",
                  variant: "danger",
                  onConfirm: () => {
                    setConfirm(null);
                    doAction("DELETE", "");
                  },
                })
              }
              disabled={!!actionLoading}
              className="w-full py-2.5 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg hover:bg-red-400/15 transition-all disabled:opacity-50 cursor-pointer"
            >
              🗑 Delete Gym
            </button>
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { token, logout, _hasHydrated } = useSuperAdminStore();
  const searchRef = useRef<HTMLInputElement>(null);

  const [gyms, setGyms] = useState<GymClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGym, setSelectedGym] = useState<GymClient | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(
    null,
  );
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Welcome modal — shown once per session via sessionStorage flag
  const [showWelcome, setShowWelcome] = useState<boolean>(
    () => !sessionStorage.getItem("gms:sa-welcomed"),
  );

  const handleDismissWelcome = () => {
    sessionStorage.setItem("gms:sa-welcomed", "1");
    setShowWelcome(false);
  };

  // ── Idle timeout — 15 min inactivity → auto-logout ────────────────────────
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const handleIdleWarn = useCallback(() => {
    setIdleCountdown(60);
    setShowIdleWarning(true);
    // Tick the countdown every second for display only —
    // actual logout is fired by useIdleTimeout, not this counter.
    countdownRef.current = setInterval(() => {
      setIdleCountdown((s) => Math.max(0, s - 1));
    }, 1000);
  }, []);

  const handleIdleReset = useCallback(() => {
    stopCountdown();
    setShowIdleWarning(false);
    setIdleCountdown(60);
  }, []);

  const handleIdleLogout = useCallback(() => {
    stopCountdown();
    setShowIdleWarning(false);
    logout();
    navigate("/superadmin");
  }, [logout, navigate]);

  useIdleTimeout({
    idleMinutes: 15,
    warningSeconds: 60,
    onIdle: handleIdleLogout,
    onWarn: handleIdleWarn,
    onReset: handleIdleReset,
  });

  const showToast = (msg: string, type: "success" | "error" | "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchGyms = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/api/superadmin/gyms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        logout();
        navigate("/superadmin");
        return;
      }
      const data = await res.json();
      if (!data.success) {
        setErrorMsg("Failed to load gyms.");
        return;
      }
      setGyms(data.gyms);
    } catch {
      setErrorMsg("Connection failed.");
    } finally {
      setLoading(false);
    }
  }, [token, logout, navigate]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) {
      navigate("/superadmin");
      return;
    }
    fetchGyms();
  }, [_hasHydrated, token, fetchGyms, navigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/superadmin");
  };

  const filtered = gyms.filter((g) => {
    const matchSearch =
      !search.trim() ||
      g.gymName.toLowerCase().includes(search.toLowerCase()) ||
      g.gymClientId.toLowerCase().includes(search.toLowerCase()) ||
      g.contactEmail.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || g.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const stats = {
    total: gyms.length,
    active: gyms.filter((g) => g.status === "active").length,
    suspended: gyms.filter((g) => g.status === "suspended").length,
    trial: gyms.filter((g) => g.billingStatus === "trial").length,
    paid: gyms.filter((g) => g.billingStatus === "paid").length,
    expiringSoon: gyms.filter(
      (g) =>
        g.billingStatus === "trial" &&
        g.trialEndsAt &&
        new Date(g.trialEndsAt).getTime() <= sevenDaysFromNow &&
        new Date(g.trialEndsAt).getTime() > Date.now(),
    ).length,
  };

  if (!_hasHydrated) return null;

  return (
    <>
      <style>{`
        @keyframes saFadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes saSlideIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* Welcome modal */}
      {showWelcome && <WelcomeModal onDismiss={handleDismissWelcome} />}

      {/* Idle warning modal */}
      {showIdleWarning && (
        <IdleWarningModal
          secondsLeft={idleCountdown}
          onStayLoggedIn={handleIdleReset}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-semibold shadow-lg border ${
            toast.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              : toast.type === "error"
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : "bg-blue-500/15 border-blue-500/30 text-blue-400"
          }`}
          style={{ animation: "saFadeIn 0.2s ease" }}
        >
          {toast.msg}
        </div>
      )}

      <div
        className="min-h-screen bg-[#1a1a1a]"
        style={{
          backgroundImage: `radial-gradient(ellipse 60% 40% at 10% 20%, rgba(255,184,0,0.04) 0%, transparent 60%)`,
        }}
      >
        {/* Top bar */}
        <div className="border-b border-white/10 bg-[#1a1a1a]/95 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[#FFB800] font-black text-sm tracking-widest uppercase">
                ⚡ GMS Control
              </span>
              <span className="hidden sm:block text-white/15 text-xs">·</span>
              <span className="hidden sm:block text-white/25 text-xs font-medium">
                Super Admin
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate("/superadmin/audit-log")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/30 hover:text-[#FFB800] hover:bg-[#FFB800]/8 rounded-lg transition-all cursor-pointer font-semibold"
              >
                <span>📋</span>
                <span className="hidden sm:block">Audit Log</span>
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="px-3 py-1.5 text-xs text-white/30 hover:text-red-400 hover:bg-red-500/8 rounded-lg transition-all cursor-pointer font-semibold"
              >
                Logout →
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Stats row */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {[
                {
                  label: "Total Gyms",
                  value: stats.total,
                  color: "#FFB800",
                  sub: `${
                    gyms.filter((g) => {
                      const d = Date.now() - new Date(g.createdAt).getTime();
                      return d < 7 * 86400000;
                    }).length
                  } this week`,
                },
                {
                  label: "Active",
                  value: stats.active,
                  color: "#22c55e",
                  sub: "currently running",
                },
                {
                  label: "Suspended",
                  value: stats.suspended,
                  color: "#f59e0b",
                  sub: stats.suspended > 0 ? "needs attention" : "all clear",
                },
                {
                  label: "On Trial",
                  value: stats.trial,
                  color: "#60a5fa",
                  sub: "30-day trial",
                },
                {
                  label: "Paid",
                  value: stats.paid,
                  color: "#22c55e",
                  sub: "active subscribers",
                },
                {
                  label: "Expiring Soon",
                  value: stats.expiringSoon,
                  color: "#FF6B1A",
                  sub: "within 7 days",
                },
              ].map(({ label, value, color, sub }) => (
                <div
                  key={label}
                  className="bg-[#212121] border border-white/10 rounded-xl p-4 transition-all duration-200 hover:scale-[1.03] hover:border-white/20 group"
                  style={{ cursor: "default" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                      {label}
                    </div>
                    <span className="text-base opacity-40 group-hover:opacity-70 transition-opacity">
                      {STAT_ICONS[label]}
                    </span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color }}>
                    {value === 0 && label === "Expiring Soon" ? (
                      <span style={{ color: "#22c55e" }}>✓</span>
                    ) : (
                      value
                    )}
                  </div>
                  <div className="text-[10px] text-white/20 mt-1 truncate">
                    {sub}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              {/* Search with icon */}
              <div className="relative flex-1 w-full sm:max-w-md">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 text-sm pointer-events-none">
                  🔍
                </span>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search gym name, ID, or email... ( / )"
                  className="w-full bg-[#212121] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#FFB800] text-black text-xs font-bold rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <span className="text-base leading-none">+</span>
                New Gym Client
              </button>
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {(["all", "active", "suspended", "deleted"] as const).map((f) => {
                const labels: Record<string, string> = {
                  all: "All",
                  active: "Active",
                  suspended: "Suspended",
                  deleted: "Deleted",
                };
                const chipColors: Record<string, string> = {
                  all: "#FFB800",
                  active: "#22c55e",
                  suspended: "#f59e0b",
                  deleted: "#ef4444",
                };
                const isActive = statusFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className="px-3 py-1 text-[11px] font-bold uppercase rounded-full border transition-all cursor-pointer"
                    style={{
                      color: isActive ? chipColors[f] : "rgba(255,255,255,0.3)",
                      background: isActive
                        ? `${chipColors[f]}15`
                        : "transparent",
                      borderColor: isActive
                        ? `${chipColors[f]}50`
                        : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {labels[f]}
                    {f !== "all" && (
                      <span className="ml-1 opacity-60">
                        {f === "active"
                          ? gyms.filter((g) => g.status === "active").length
                          : f === "suspended"
                            ? gyms.filter((g) => g.status === "suspended")
                                .length
                            : gyms.filter((g) => g.status === "deleted").length}
                      </span>
                    )}
                  </button>
                );
              })}
              {(search || statusFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                  className="px-3 py-1 text-[11px] font-semibold text-white/30 hover:text-white border border-white/10 hover:border-white/20 rounded-full transition-all cursor-pointer"
                >
                  Clear filters
                </button>
              )}
              <span className="text-[10px] text-white/20 ml-auto">
                {filtered.length} of {gyms.length} gyms
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Gym list */}
          <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
            <div
              className="hidden md:grid px-5 py-3 border-b border-white/10 bg-white/[0.02]"
              style={{ gridTemplateColumns: "1fr 1.5fr 1fr 1fr 1fr 1fr auto" }}
            >
              {[
                "Gym ID",
                "Gym Name",
                "Status",
                "Billing",
                "Expiry",
                "Last Login",
                "",
              ].map((h) => (
                <div
                  key={h}
                  className="text-[10px] font-semibold uppercase tracking-widest text-white/30"
                >
                  {h}
                </div>
              ))}
            </div>

            {loading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </>
            )}

            {!loading && filtered.length === 0 && (
              <div className="py-20 text-center px-6">
                {gyms.length === 0 ? (
                  <>
                    <div className="text-5xl mb-4 opacity-30">🏢</div>
                    <div className="text-white font-bold text-base mb-1">
                      No gym clients yet
                    </div>
                    <div className="text-white/30 text-sm mb-5">
                      Get started by adding your first gym client.
                    </div>
                    <button
                      onClick={() => setShowCreate(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FFB800] text-black text-xs font-bold rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 cursor-pointer"
                    >
                      <span>+</span> Add First Gym Client
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-4xl mb-3 opacity-20">🔍</div>
                    <div className="text-white/30 text-sm font-semibold">
                      No results found
                    </div>
                    <div className="text-white/20 text-xs mt-1">
                      Try adjusting your search or filters
                    </div>
                    <button
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                      }}
                      className="mt-4 px-4 py-2 text-xs font-semibold text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer"
                    >
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            )}

            {!loading &&
              filtered.map((gym, rowIdx) => {
                const days = daysUntil(gym.trialEndsAt);
                const isExpiringSoon =
                  gym.billingStatus === "trial" &&
                  days !== null &&
                  days > 0 &&
                  days <= 5; // tightened to 5 days per prompt
                const isCritical = days !== null && days <= 0;
                const neverLoggedIn = !gym.lastLoginAt;
                const isCopied = copiedId === gym.gymClientId;

                return (
                  <div
                    key={gym._id}
                    className={`grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 md:gap-0 px-5 py-4 border-b border-white/5 last:border-0 transition-colors cursor-pointer group ${
                      isExpiringSoon
                        ? "bg-amber-400/[0.02] hover:bg-amber-400/[0.04]"
                        : rowIdx % 2 === 1
                          ? "bg-white/[0.01] hover:bg-white/[0.03]"
                          : "hover:bg-white/[0.02]"
                    }`}
                    onClick={() => setSelectedGym(gym)}
                  >
                    {/* Gym ID + copy button */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#FFB800]">
                        {gym.gymClientId}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(gym.gymClientId, () => {
                            setCopiedId(gym.gymClientId);
                            setTimeout(() => setCopiedId(null), 1500);
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] px-1.5 py-0.5 rounded border border-white/15 text-white/40 hover:text-white hover:border-white/30 cursor-pointer"
                        title="Copy ID"
                      >
                        {isCopied ? "✓" : "copy"}
                      </button>
                    </div>

                    {/* Gym info — name + email + address */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{
                          background: `${STATUS_COLORS[gym.status]}18`,
                          border: `1px solid ${STATUS_COLORS[gym.status]}40`,
                          color: STATUS_COLORS[gym.status],
                        }}
                      >
                        {gym.gymName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {gym.gymName}
                        </div>
                        <div className="text-[10px] text-white/30 truncate">
                          {gym.contactEmail}
                        </div>
                        {gym.gymAddress && (
                          <div className="text-[10px] text-white/20 truncate">
                            📍 {gym.gymAddress}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center">
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border"
                        style={{
                          color: STATUS_COLORS[gym.status],
                          background: `${STATUS_COLORS[gym.status]}15`,
                          borderColor: `${STATUS_COLORS[gym.status]}40`,
                        }}
                      >
                        {gym.status}
                      </span>
                    </div>

                    {/* Billing badge */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border"
                        style={{
                          color: BILLING_COLORS[gym.billingStatus],
                          background: `${BILLING_COLORS[gym.billingStatus]}15`,
                          borderColor: `${BILLING_COLORS[gym.billingStatus]}40`,
                        }}
                      >
                        {gym.billingStatus}
                      </span>
                    </div>

                    {/* Expiry column */}
                    <div className="flex items-center">
                      {gym.trialEndsAt ? (
                        isCritical ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400">
                            Expired
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 animate-pulse">
                            ⚠ {days}d left
                          </span>
                        ) : (
                          <span className="text-[10px] text-white/30">
                            {days !== null
                              ? `${days}d`
                              : formatDate(gym.trialEndsAt)}
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-white/15">—</span>
                      )}
                    </div>

                    {/* Last login */}
                    <div className="flex items-center">
                      {neverLoggedIn ? (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-400">
                          Never
                        </span>
                      ) : (
                        <span className="text-xs text-white/40">
                          {timeAgo(gym.lastLoginAt)}
                        </span>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="hidden md:flex items-center">
                      <span className="text-white/20 group-hover:text-white/50 text-xs transition-colors">
                        →
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateGymModal
          token={token!}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            fetchGyms();
            showToast("Gym created. Invite sent! 🎉", "success");
          }}
        />
      )}

      {selectedGym && (
        <GymDetailDrawer
          gym={selectedGym}
          token={token!}
          onClose={() => setSelectedGym(null)}
          onRefresh={fetchGyms}
          onToast={showToast}
        />
      )}

      {showLogoutConfirm && (
        <ConfirmModal
          title="Log out of Super Admin?"
          message="You will be returned to the Super Admin login page."
          confirmLabel="Log Out"
          variant="warning"
          onConfirm={() => {
            setShowLogoutConfirm(false);
            handleLogout();
          }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </>
  );
}
