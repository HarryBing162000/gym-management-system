/**
 * MembersPage.tsx
 * IronCore GMS — Member Management
 *
 * Features:
 *   - Paginated member table with search + filter
 *   - Slide-in drawer for add / edit (rendered via portal)
 *   - Inline status badges with expiry awareness
 *   - Deactivate / reactivate (owner only)
 *   - Real API via memberService
 *
 * File location: client/src/pages/MembersPage.tsx
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "../store/authStore";
import { memberService } from "../services/memberService";
import type {
  Member,
  MemberStatus,
  MemberPlan,
  CreateMemberPayload,
  UpdateMemberPayload,
} from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLANS: MemberPlan[] = ["Monthly", "Quarterly", "Annual", "Student"];

const PLAN_PRICES: Record<MemberPlan, number> = {
  Monthly: 800,
  Quarterly: 2100,
  Annual: 7500,
  Student: 500,
};

const STATUS_STYLES: Record<MemberStatus, string> = {
  active: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  inactive: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  expired: "text-red-400 bg-red-400/10 border-red-400/20",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function daysUntilExpiry(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

// ─── Drawer Form ──────────────────────────────────────────────────────────────

interface DrawerProps {
  mode: "add" | "edit";
  member?: Member;
  onClose: () => void;
  onSaved: (mode: "add" | "edit") => void;
}

function MemberDrawer({ mode, member, onClose, onSaved }: DrawerProps) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [plan, setPlan] = useState<MemberPlan>(member?.plan ?? "Monthly");
  const [status, setStatus] = useState<"active" | "inactive">(
    member?.status === "expired" ? "inactive" : (member?.status ?? "active"),
  );
  const [expiresAt, setExpiresAt] = useState(
    member?.expiresAt ? member.expiresAt.split("T")[0] : "",
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Auto-set expiry based on plan when adding
  useEffect(() => {
    if (mode === "add" && plan) {
      const base = new Date();
      if (plan === "Monthly") base.setMonth(base.getMonth() + 1);
      if (plan === "Quarterly") base.setMonth(base.getMonth() + 3);
      if (plan === "Annual") base.setFullYear(base.getFullYear() + 1);
      if (plan === "Student") base.setMonth(base.getMonth() + 6);
      setExpiresAt(base.toISOString().split("T")[0]);
    }
  }, [plan, mode]);

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!name.trim() || name.trim().split(" ").length < 2) {
      setErrorMsg("Please enter a full name (first and last).");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (!expiresAt) {
      setErrorMsg("Please set an expiry date.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "add") {
        const payload: CreateMemberPayload = {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          plan,
          status,
          expiresAt,
        };
        await memberService.create(payload);
        onSaved(mode);
      } else {
        const payload: UpdateMemberPayload = {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          plan,
          status,
          expiresAt,
        };
        await memberService.update(member!.gymId, payload);
        onSaved(mode);
      }
    } catch (axiosError) {
      const err = axiosError as { response?: { data?: { message?: string } } };
      setErrorMsg(
        err.response?.data?.message ||
          "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const drawerContent = (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeScaleIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-md bg-[#1e1e1e] border-l border-white/10 z-50 flex flex-col shadow-2xl"
        style={{ animation: "slideInRight 0.25s ease" }}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-[#FF6B1A] mb-0.5">
              {mode === "add" ? "New Member" : "Edit Member"}
            </div>
            <div className="text-white font-bold text-base">
              {mode === "add" ? "Register a new member" : member?.name}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all flex items-center justify-center text-sm cursor-pointer">
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Full Name <span className="text-[#FF6B1A]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Email <span className="text-white/20">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="juan@email.com"
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Phone <span className="text-white/20">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09XX XXX XXXX"
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {/* Plan */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Membership Plan <span className="text-[#FF6B1A]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    plan === p
                      ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]"
                      : "border-white/10 bg-[#2a2a2a] text-white/40 hover:border-white/20"
                  }`}>
                  <div className="text-xs font-bold uppercase tracking-wide">
                    {p}
                  </div>
                  <div className="text-xs font-mono mt-0.5 opacity-70">
                    ₱{PLAN_PRICES[p].toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Status <span className="text-[#FF6B1A]">*</span>
            </label>
            <div className="flex gap-2">
              {(["active", "inactive"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all cursor-pointer ${
                    status === s
                      ? s === "active"
                        ? "border-emerald-400 bg-emerald-400/10 text-emerald-400"
                        : "border-amber-400 bg-amber-400/10 text-amber-400"
                      : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Expiry Date */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Expiry Date <span className="text-[#FF6B1A]">*</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-[#FF6B1A] transition-colors"
              style={{ colorScheme: "dark" }}
            />
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-sm font-semibold rounded-lg transition-all cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Saving...
              </span>
            ) : mode === "add" ? (
              "Register Member"
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(drawerContent, document.body);
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogContent = (
    <>
      <div
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div
        className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-xl p-6 shadow-2xl"
        style={{
          transform: "translate(-50%, -50%)",
          animation: "fadeScaleIn 0.2s ease",
        }}>
        <div className="text-white font-bold text-base mb-2">{title}</div>
        <div className="text-white/50 text-sm mb-6">{message}</div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all active:scale-95 cursor-pointer ${
              danger
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "bg-emerald-500 hover:bg-emerald-400 text-white"
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(dialogContent, document.body);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ConfirmState = {
  member: Member;
  action: "deactivate" | "reactivate";
} | null;

export default function MembersPage() {
  const { user } = useAuthStore();
  const isOwner = user?.role === "owner";

  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 15;

  const [drawerMode, setDrawerMode] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<Member | undefined>();
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  // Toast with type support — success (green) or warning (amber)
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState<"success" | "warning">("success");

  const showToast = (msg: string, type: "success" | "warning" = "success") => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(""), 5500);
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const res = await memberService.getAll({
        search: search.trim() || undefined,
        status: filterStatus || undefined,
        plan: filterPlan || undefined,
        page,
        limit: LIMIT,
      });
      setMembers(res.members);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setFetchError("Failed to load members. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterPlan, page]);

  useEffect(() => {
    const id = setTimeout(fetchMembers, search ? 400 : 0);
    return () => clearTimeout(id);
  }, [fetchMembers, search]);

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterPlan]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSaved = (savedMode: "add" | "edit") => {
    setDrawerMode(null);
    setEditTarget(undefined);
    fetchMembers();
    showToast(
      savedMode === "add"
        ? "Member registered successfully."
        : "Member updated successfully.",
    );
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    try {
      if (confirmState.action === "deactivate") {
        await memberService.deactivate(confirmState.member.gymId);
        showToast(`${confirmState.member.name} has been deactivated.`);
      } else {
        await memberService.reactivate(confirmState.member.gymId);
        showToast(`${confirmState.member.name} has been reactivated.`);
      }
      fetchMembers();
    } catch {
      showToast("Action failed. Please try again.");
    } finally {
      setConfirmState(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeScaleIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-4">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Members</h2>
            <p className="text-xs text-white/30 mt-0.5">
              {total} member{total !== 1 ? "s" : ""} registered
            </p>
          </div>
          <button
            onClick={() => {
              setDrawerMode("add");
              setEditTarget(undefined);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer">
            <span className="text-base leading-none">+</span>
            Add Member
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30"
              width="14"
              height="14"
              viewBox="0 0 18 18"
              fill="none">
              <circle
                cx="8"
                cy="8"
                r="5.5"
                stroke="#FF6B1A"
                strokeWidth="1.5"
              />
              <path
                d="M12.5 12.5L16 16"
                stroke="#FF6B1A"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or GYM-ID..."
              className="w-full bg-[#212121] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs cursor-pointer">
                ✕
              </button>
            )}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
            style={{ colorScheme: "dark" }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
          </select>

          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
            style={{ colorScheme: "dark" }}>
            <option value="">All Plans</option>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* ── Table ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/10">
            {["Member", "Plan", "Status", "Expires", "In Gym", "Actions"].map(
              (h) => (
                <div
                  key={h}
                  className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {h}
                </div>
              ),
            )}
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
                    <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
                  </div>
                  <div className="hidden md:flex gap-6">
                    <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
                    <div className="h-5 w-14 bg-white/5 rounded-full animate-pulse" />
                    <div className="h-3 w-20 bg-white/5 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && fetchError && (
            <div className="px-5 py-12 text-center">
              <div className="text-red-400 text-sm mb-3">{fetchError}</div>
              <button
                onClick={fetchMembers}
                className="text-xs text-[#FF6B1A] hover:underline cursor-pointer">
                Try again
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !fetchError && members.length === 0 && (
            <div className="px-5 py-16 text-center">
              <div className="text-4xl mb-3 opacity-20">◉</div>
              <div className="text-white/30 text-sm font-semibold">
                No members found
              </div>
              <div className="text-white/20 text-xs mt-1">
                {search || filterStatus || filterPlan
                  ? "Try adjusting your filters"
                  : 'Click "Add Member" to register your first member'}
              </div>
            </div>
          )}

          {/* Member rows */}
          {!loading &&
            !fetchError &&
            members.map((m) => {
              const days = daysUntilExpiry(m.expiresAt);
              const expiringSoon = days > 0 && days <= 7;

              return (
                <div
                  key={m.gymId}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/2] transition-colors">
                  {/* Member info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
                      {getInitials(m.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {m.name}
                      </div>
                      <div className="text-[11px] text-white/30 font-mono">
                        {m.gymId}
                      </div>
                      {(m.email || m.phone) && (
                        <div className="text-[10px] text-white/20 truncate mt-0.5">
                          {m.email || m.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Plan */}
                  <div className="flex md:items-center">
                    <span className="text-xs text-white/40 md:hidden mr-2 w-14 shrink-0">
                      Plan
                    </span>
                    <span className="text-xs font-semibold text-white/70">
                      {m.plan}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex md:items-center">
                    <span className="text-xs text-white/40 md:hidden mr-2 w-14 shrink-0">
                      Status
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_STYLES[m.status]}`}>
                      {m.status}
                    </span>
                  </div>

                  {/* Expiry */}
                  <div className="flex md:items-center">
                    <span className="text-xs text-white/40 md:hidden mr-2 w-14 shrink-0">
                      Expires
                    </span>
                    <div>
                      <div
                        className={`text-xs font-mono ${expiringSoon ? "text-amber-400" : days < 0 ? "text-red-400" : "text-white/50"}`}>
                        {formatDate(m.expiresAt)}
                      </div>
                      {expiringSoon && (
                        <div className="text-[10px] text-amber-400/70">
                          {days}d left
                        </div>
                      )}
                      {days < 0 && (
                        <div className="text-[10px] text-red-400/70">
                          Expired
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Check-in */}
                  <div className="flex md:items-center">
                    <span className="text-xs text-white/40 md:hidden mr-2 w-14 shrink-0">
                      In gym
                    </span>
                    <span
                      className={`lg:ml-4 md:ml-3 sm:ml-0 text-[10px] font-semibold ${m.checkedIn ? "text-[#FF6B1A]" : "text-white/20"}`}>
                      {m.checkedIn ? "● Inside" : "○ Away"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {/* Edit */}
                    <button
                      onClick={() => {
                        setEditTarget(m);
                        setDrawerMode("edit");
                      }}
                      title="Edit member"
                      className="p-1.5 text-white/50 hover:text-blue-400 border border-white/10 hover:border-blue-400/40 rounded-md transition-all cursor-pointer">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>

                    {/* Deactivate / Reactivate — owner only */}
                    {isOwner &&
                      (m.isActive ? (
                        <button
                          onClick={() =>
                            setConfirmState({ member: m, action: "deactivate" })
                          }
                          title="Deactivate member"
                          className="p-1.5 text-red-400/60 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 rounded-md transition-all cursor-pointer">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="8.5" cy="7" r="4" />
                            <line x1="18" y1="8" x2="23" y2="13" />
                            <line x1="23" y1="8" x2="18" y2="13" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setConfirmState({ member: m, action: "reactivate" })
                          }
                          title="Reactivate member"
                          className="p-1.5 text-emerald-400/60 hover:text-emerald-400 border border-emerald-400/20 hover:border-emerald-400/40 rounded-md transition-all cursor-pointer">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="8.5" cy="7" r="4" />
                            <polyline points="17 11 19 13 23 9" />
                          </svg>
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Drawer ── */}
      {drawerMode && (
        <MemberDrawer
          mode={drawerMode}
          member={editTarget}
          onClose={() => {
            setDrawerMode(null);
            setEditTarget(undefined);
          }}
          onSaved={(savedMode) => handleSaved(savedMode)}
        />
      )}

      {/* ── Confirm dialog ── */}
      {confirmState && (
        <ConfirmDialog
          title={
            confirmState.action === "deactivate"
              ? "Deactivate Member"
              : "Reactivate Member"
          }
          message={
            confirmState.action === "deactivate"
              ? `${confirmState.member.name} will be marked inactive and blocked from check-in. This can be undone.`
              : `${confirmState.member.name} will be restored to active status.`
          }
          confirmLabel={
            confirmState.action === "deactivate" ? "Deactivate" : "Reactivate"
          }
          danger={confirmState.action === "deactivate"}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {/* ── Toast — green for success, amber for warning ── */}
      {toast &&
        createPortal(
          <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl border max-w-sm text-center ${
              toastType === "warning"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-[#2a2a2a] border-white/15 text-white"
            }`}
            style={{ animation: "fadeScaleIn 0.2s ease" }}>
            {toast}
          </div>,
          document.body,
        )}
    </>
  );
}
