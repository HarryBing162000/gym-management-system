/**
 * SuperAdminDashboard.tsx
 * GMS — Super Admin Dashboard
 *
 * Manages all gym clients:
 * - List gyms with status, billing, last login
 * - Create new gym + owner (sends invite email)
 * - Suspend / reactivate / delete
 * - Reset owner password
 * - Resend invite
 * - Edit gym info + billing + notes
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdminStore } from "../store/superAdminStore";

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
  if (!iso) return "Never logged in";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
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
          {/* Gym Info */}
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

          {/* Owner Info */}
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

          {/* Billing */}
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 pt-2">
            Billing Status
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["trial", "paid", "overdue", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setBillingStatus(s)}
                className={`py-2 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${
                  billingStatus === s
                    ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                    : "border-white/10 text-white/30 hover:text-white/60"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Notes */}
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
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");

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
        body: JSON.stringify({ notes, billingStatus }),
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
            <span className="text-xs text-white/60">
              {timeAgo(gym.lastLoginAt)}
            </span>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3">
            <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">
              Joined
            </div>
            <span className="text-xs text-white/60">
              {formatDate(gym.createdAt)}
            </span>
          </div>
        </div>

        {/* Billing status editor */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">
            Billing Status
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(["trial", "paid", "overdue", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setBillingStatus(s)}
                className={`py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${
                  billingStatus === s
                    ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                    : "border-white/10 text-white/30 hover:text-white/60"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
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
            <button
              onClick={() => doAction("POST", "/resend-invite")}
              disabled={!!actionLoading}
              className="w-full py-2.5 text-xs font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-lg hover:bg-blue-400/15 transition-all disabled:opacity-50 cursor-pointer"
            >
              {actionLoading === "/resend-invite"
                ? "Sending..."
                : "📧 Resend Invite Email"}
            </button>

            <button
              onClick={() => doAction("POST", "/reset-password")}
              disabled={!!actionLoading}
              className="w-full py-2.5 text-xs font-semibold text-[#FFB800] bg-[#FFB800]/10 border border-[#FFB800]/20 rounded-lg hover:bg-[#FFB800]/15 transition-all disabled:opacity-50 cursor-pointer"
            >
              {actionLoading === "/reset-password"
                ? "Sending..."
                : "🔑 Send Password Reset"}
            </button>

            {gym.status === "active" ? (
              <button
                onClick={() => doAction("PATCH", "/suspend")}
                disabled={!!actionLoading}
                className="w-full py-2.5 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg hover:bg-amber-400/15 transition-all disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "/suspend"
                  ? "Suspending..."
                  : "⚠️ Suspend Gym"}
              </button>
            ) : gym.status === "suspended" ? (
              <button
                onClick={() => doAction("PATCH", "/reactivate")}
                disabled={!!actionLoading}
                className="w-full py-2.5 text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg hover:bg-emerald-400/15 transition-all disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "/reactivate"
                  ? "Reactivating..."
                  : "✓ Reactivate Gym"}
              </button>
            ) : null}

            <button
              onClick={() => {
                if (
                  confirm(`Delete "${gym.gymName}"? This cannot be undone.`)
                ) {
                  doAction("DELETE", "");
                }
              }}
              disabled={!!actionLoading}
              className="w-full py-2.5 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg hover:bg-red-400/15 transition-all disabled:opacity-50 cursor-pointer"
            >
              {actionLoading === "" && false ? "Deleting..." : "🗑 Delete Gym"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { token, logout, _hasHydrated } = useSuperAdminStore();

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

  const stats = {
    total: gyms.length,
    active: gyms.filter((g) => g.status === "active").length,
    suspended: gyms.filter((g) => g.status === "suspended").length,
    trial: gyms.filter((g) => g.billingStatus === "trial").length,
    paid: gyms.filter((g) => g.billingStatus === "paid").length,
  };

  if (!_hasHydrated) return null;

  return (
    <>
      <style>{`
        @keyframes saFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes saSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

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
        <div className="border-b border-white/10 bg-[#1a1a1a]/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[#FFB800] font-black text-sm tracking-widest uppercase">
                ⚡ GMS Control
              </span>
              <span className="hidden sm:block text-white/20 text-xs">
                Super Admin
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer"
            >
              Logout →
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total Gyms", value: stats.total, color: "#FFB800" },
              { label: "Active", value: stats.active, color: "#22c55e" },
              { label: "Suspended", value: stats.suspended, color: "#f59e0b" },
              { label: "On Trial", value: stats.trial, color: "#60a5fa" },
              { label: "Paid", value: stats.paid, color: "#22c55e" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-[#212121] border border-white/10 rounded-xl p-4"
              >
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">
                  {label}
                </div>
                <div className="text-2xl font-bold" style={{ color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-1 gap-2 w-full sm:max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search gym name, ID, or email..."
                className="flex-1 bg-[#212121] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/60 outline-none focus:border-[#FFB800] transition-colors cursor-pointer"
                style={{ colorScheme: "dark" }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FFB800] text-black text-xs font-bold rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <span className="text-base leading-none">+</span>
              New Gym Client
            </button>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Gym list */}
          <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
            {/* Table header */}
            <div
              className="hidden md:grid px-5 py-3 border-b border-white/10 bg-white/[0.02]"
              style={{ gridTemplateColumns: "1fr 1.5fr 1fr 1fr 1fr auto" }}
            >
              {[
                "Gym ID",
                "Gym Name",
                "Status",
                "Billing",
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

            {/* Loading */}
            {loading && (
              <div className="py-16 text-center">
                <div className="w-6 h-6 border-2 border-white/10 border-t-[#FFB800] rounded-full animate-spin mx-auto" />
              </div>
            )}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
              <div className="py-16 text-center">
                <div className="text-4xl mb-3 opacity-20">⊕</div>
                <div className="text-white/30 text-sm font-semibold">
                  {gyms.length === 0
                    ? "No gym clients yet"
                    : "No results found"}
                </div>
                {gyms.length === 0 && (
                  <div className="text-white/20 text-xs mt-1">
                    Create your first gym client above
                  </div>
                )}
              </div>
            )}

            {/* Rows */}
            {!loading &&
              filtered.map((gym) => (
                <div
                  key={gym._id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr_1fr_1fr_auto] gap-3 md:gap-0 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setSelectedGym(gym)}
                >
                  {/* ID */}
                  <div className="flex items-center">
                    <span className="text-xs font-mono font-bold text-[#FFB800]">
                      {gym.gymClientId}
                    </span>
                  </div>

                  {/* Name + email */}
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
                    </div>
                  </div>

                  {/* Status */}
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

                  {/* Billing */}
                  <div className="flex items-center">
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

                  {/* Last login */}
                  <div className="flex items-center">
                    <span className="text-xs text-white/40">
                      {timeAgo(gym.lastLoginAt)}
                    </span>
                  </div>

                  {/* Arrow */}
                  <div className="hidden md:flex items-center">
                    <span className="text-white/20 text-xs">→</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Modals */}
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
    </>
  );
}
