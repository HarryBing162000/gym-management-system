/**
 * MembersPage.tsx
 * LakasGMS — Member Management
 *
 * Fix added:
 *   - lastMemberUpdate watcher: refetches when PaymentsPage triggers a renewal
 *     so updated expiresAt shows immediately without manual refresh
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "../store/authStore";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
import { memberService } from "../services/memberService";
import { syncManager } from "../lib/syncManager";
import { paymentService } from "../services/paymentService";
import type {
  Member,
  MemberStatus,
  CreateMemberPayload,
  UpdateMemberPayload,
} from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<MemberStatus, string> = {
  active: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  inactive: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  expired: "text-red-400 bg-red-400/10 border-red-400/20",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const timezone = useGymStore.getState().getTimezone();
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
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
  onSaved: (mode: "add" | "edit", offlineMsg?: string) => void;
}

function MemberDrawer({ mode, member, onClose, onSaved }: DrawerProps) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    member?.status === "expired" ? "inactive" : (member?.status ?? "active"),
  );
  const [expiresAt, setExpiresAt] = useState(
    member?.expiresAt ? member.expiresAt.split("T")[0] : "",
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [amountPaid, setAmountPaid] = useState<string>("");

  const { getActivePlans, getPlanPrice, getPlanDuration } = useGymStore();
  const activePlans = getActivePlans();
  const defaultPlan = member?.plan ?? activePlans[0]?.name ?? "Monthly";
  const [plan, setPlan] = useState(defaultPlan);
  const planPrice = getPlanPrice(plan);

  useEffect(() => {
    if (mode === "add" && plan) {
      const months = getPlanDuration(plan);
      const base = new Date();
      base.setMonth(base.getMonth() + months);
      setExpiresAt(base.toISOString().split("T")[0]);
    }
  }, [plan, mode, getPlanDuration]);

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
    if (phone && phone.length !== 11) {
      setErrorMsg("Phone number must be exactly 11 digits.");
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
          paymentMethod,
          amountPaid: amountPaid ? Number(amountPaid) : undefined,
        };
        if (!navigator.onLine) {
          // Queue for sync when internet restores
          await syncManager.enqueue({
            url: "/members",
            method: "POST",
            body: payload as unknown as Record<string, unknown>,
            label: `New member: ${name.trim()}`,
            token: useAuthStore.getState().token ?? "",
          });
          onSaved(
            mode,
            `${name.trim().split(" ")[0]} queued — will be added when internet restores.`,
          );
        } else {
          await memberService.create(payload);
          onSaved(mode);
        }
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
      // If offline and network error, queue it
      if (!navigator.onLine) {
        const payload: CreateMemberPayload = {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          plan,
          status,
          expiresAt,
          paymentMethod,
          amountPaid: amountPaid ? Number(amountPaid) : undefined,
        };
        await syncManager.enqueue({
          url: "/members",
          method: "POST",
          body: payload as unknown as Record<string, unknown>,
          label: `New member: ${name.trim()}`,
          token: useAuthStore.getState().token ?? "",
        });
        onSaved(
          mode,
          `${name.trim().split(" ")[0]} queued — will be added when internet restores.`,
        );
        return;
      }
      setErrorMsg(
        err.response?.data?.message ||
          "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
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

      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="fixed top-0 right-0 h-full w-full max-w-md bg-[#1e1e1e] border-l border-white/10 z-50 flex flex-col shadow-2xl"
        style={{ animation: "slideInRight 0.25s ease" }}
      >
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
            className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all flex items-center justify-center text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Phone <span className="text-white/20">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                setPhone(digits);
              }}
              placeholder="09XX XXX XXXX"
              maxLength={11}
              className={`w-full bg-[#2a2a2a] border rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors ${
                phone && phone.length > 0 && phone.length !== 11
                  ? "border-red-400/60 focus:border-red-400"
                  : "border-white/10 focus:border-[#FF6B1A]"
              }`}
            />
            {phone && phone.length > 0 && phone.length !== 11 && (
              <p className="text-red-400 text-[10px] mt-1">
                Phone number must be 11 digits
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Membership Plan <span className="text-[#FF6B1A]">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {activePlans.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setPlan(p.name)}
                  className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    plan === p.name
                      ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]"
                      : "border-white/10 bg-[#2a2a2a] text-white/40 hover:border-white/20"
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-wide">
                    {p.name}
                  </div>
                  <div className="text-xs font-mono mt-0.5 opacity-70">
                    ₱{p.price.toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Status <span className="text-[#FF6B1A]">*</span>
            </label>
            <div className="flex gap-2">
              {(
                ["active", ...(mode === "edit" ? ["inactive"] : [])] as (
                  | "active"
                  | "inactive"
                )[]
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all cursor-pointer ${
                    status === s
                      ? s === "active"
                        ? "border-emerald-400 bg-emerald-400/10 text-emerald-400"
                        : "border-amber-400 bg-amber-400/10 text-amber-400"
                      : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

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

          {mode === "add" && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Payment Method <span className="text-[#FF6B1A]">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["cash", "online"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2.5 rounded-lg border text-sm font-bold uppercase tracking-wide transition-all cursor-pointer ${
                      paymentMethod === m
                        ? m === "cash"
                          ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                          : "border-blue-400 bg-blue-400/10 text-blue-400"
                        : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"
                    }`}
                  >
                    {m === "cash" ? "💵 Cash" : "🏦 Online"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "add" && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Amount Paid{" "}
                <span className="text-white/20">(leave blank for full)</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-mono">
                  ₱
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amountPaid}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setAmountPaid(val);
                  }}
                  placeholder="Full amount auto-filled"
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                />
              </div>
              {amountPaid && Number(amountPaid) > 0 && (
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className="text-white/30">Remaining balance:</span>
                  <span className="font-mono font-semibold text-amber-400">
                    ₱
                    {Math.max(
                      0,
                      planPrice - Number(amountPaid),
                    ).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-sm font-semibold rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Saving...
              </span>
            ) : mode === "add" ? (
              navigator.onLine ? (
                "Register Member"
              ) : (
                "Queue Member (Offline)"
              )
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
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
  return createPortal(
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
        }}
      >
        <div className="text-white font-bold text-base mb-2">{title}</div>
        <div className="text-white/50 text-sm mb-6">{message}</div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all active:scale-95 cursor-pointer ${
              danger
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "bg-emerald-500 hover:bg-emerald-400 text-white"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ConfirmState = {
  member: Member;
  action: "deactivate" | "reactivate";
} | null;

interface MembersPageProps {
  forceStaffView?: boolean;
}

export default function MembersPage({
  forceStaffView = false,
}: MembersPageProps = {}) {
  const { user } = useAuthStore();
  const isOwner = forceStaffView ? false : user?.role === "owner";
  const { getActivePlans, lastMemberUpdate } = useGymStore();
  const activePlans = getActivePlans();

  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const [drawerMode, setDrawerMode] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<Member | undefined>();
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [settleTarget, setSettleTarget] = useState<Member | null>(null);
  const [settleMethod, setSettleMethod] = useState<"cash" | "online">("cash");
  const [settleAmount, setSettleAmount] = useState<string>("");
  const [settleLoading, setSettleLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const { showToast } = useToastStore();

  const hasFilters = search || filterStatus || filterPlan;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const CACHE_KEY = "gms:members-cache";

  const fetchMembers = useCallback(async () => {
    // Offline — serve from localStorage cache instead of crashing
    if (!navigator.onLine) {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          // Guard: cached.members must be an array or we fall back to []
          setMembers(Array.isArray(cached.members) ? cached.members : []);
          setTotal(typeof cached.total === "number" ? cached.total : 0);
          setTotalPages(
            typeof cached.totalPages === "number" ? cached.totalPages : 1,
          );
        }
        // No cache yet — leave members as [] (already initialised that way)
      } catch {
        // Corrupt cache — ignore, show empty list
      }
      setFetchError("");
      setLoading(false);
      return;
    }

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
      // Guard: never allow undefined to reach state — always fall back to []
      const safeMembers = Array.isArray(res.members) ? res.members : [];
      setMembers(safeMembers);
      setTotal(res.total ?? 0);
      setTotalPages(res.totalPages ?? 1);

      // Persist to cache only on the unfiltered first page so offline always
      // shows the full default list, not a filtered subset
      if (!search && !filterStatus && !filterPlan && page === 1) {
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              members: safeMembers,
              total: res.total ?? 0,
              totalPages: res.totalPages ?? 1,
            }),
          );
        } catch {
          /* storage quota — ignore */
        }
      }
    } catch {
      // Network error while online — fall back to cache if available
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          setMembers(Array.isArray(cached.members) ? cached.members : []);
          setTotal(typeof cached.total === "number" ? cached.total : 0);
          setTotalPages(
            typeof cached.totalPages === "number" ? cached.totalPages : 1,
          );
          setFetchError("Showing cached data — could not reach server.");
          return;
        }
      } catch {
        /* ignore */
      }
      setFetchError("Failed to load members. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterPlan, page]);

  useEffect(() => {
    const id = setTimeout(fetchMembers, search ? 400 : 0);
    return () => clearTimeout(id);
  }, [fetchMembers, search]);

  // Only poll when online — no point hammering failed requests every 30s
  useEffect(() => {
    if (!navigator.onLine) return;
    const id = setInterval(fetchMembers, 30000);
    return () => clearInterval(id);
  }, [fetchMembers]);

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, filterPlan]);

  // FIX: Refetch when PaymentsPage triggers a renewal — lastMemberUpdate changes
  useEffect(() => {
    if (lastMemberUpdate > 0) fetchMembers();
  }, [lastMemberUpdate]);

  // ── Offline state + auto-refresh on reconnect ─────────────────────────────
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      fetchMembers(); // auto-refresh when connection restores
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [fetchMembers]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSaved = (savedMode: "add" | "edit", offlineMsg?: string) => {
    setDrawerMode(null);
    setEditTarget(undefined);
    fetchMembers();
    showToast(
      offlineMsg ??
        (savedMode === "add"
          ? "Member registered successfully."
          : "Member updated successfully."),
      offlineMsg ? "success" : "success",
    );
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    try {
      if (confirmState.action === "deactivate") {
        await memberService.deactivate(confirmState.member.gymId);
        showToast(
          `${confirmState.member.name} has been deactivated.`,
          "success",
        );
      } else {
        await memberService.reactivate(confirmState.member.gymId);
        showToast(
          `${confirmState.member.name} has been reactivated.`,
          "success",
        );
      }
      fetchMembers();
    } catch {
      showToast("Action failed. Please try again.", "error");
    } finally {
      setConfirmState(null);
    }
  };

  const handleSettle = async () => {
    if (!settleTarget || settleLoading) return;
    setSettleLoading(true);
    const target = settleTarget;
    const method = settleMethod;
    const amount = settleAmount ? Number(settleAmount) : undefined;
    setSettleTarget(null);
    setSettleAmount("");
    try {
      const res = await paymentService.settle(target.gymId, method, amount);
      showToast(res.message, "success");
      fetchMembers();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast(
        err.response?.data?.message || "Failed to settle balance.",
        "error",
      );
    } finally {
      setSettleLoading(false);
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
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .member-row:nth-child(even) { background: rgba(255,255,255,0.012); }
        .member-row:hover { background: rgba(255,107,26,0.04) !important; }
      `}</style>

      <div
        className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-4"
        style={{ animation: "fadeIn 0.2s ease" }}
      >
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Members</h2>
            <p className="text-xs text-white/30 mt-0.5">
              {loading ? (
                "Loading..."
              ) : (
                <>
                  {total} member{total !== 1 ? "s" : ""} registered
                  {hasFilters && !loading && (
                    <span className="ml-1.5 text-[#FF6B1A]/60">(filtered)</span>
                  )}
                </>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              setDrawerMode("add");
              setEditTarget(undefined);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            Add Member
          </button>
        </div>

        {/* ── Offline banner ── */}
        {isOffline && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-400/10 border border-amber-400/20 rounded-lg">
            <span className="text-amber-400 text-xs">⚡</span>
            <span className="text-amber-400 text-xs font-semibold">
              You're offline — showing cached members. Changes will sync when
              connection restores.
            </span>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30"
                width="14"
                height="14"
                viewBox="0 0 18 18"
                fill="none"
              >
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
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-9 pr-8 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
              style={{ colorScheme: "dark" }}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="expired">Expired</option>
            </select>
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
              className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
              style={{ colorScheme: "dark" }}
            >
              <option value="">All Plans</option>
              {activePlans.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterStatus("");
                  setFilterPlan("");
                }}
                className="px-3 py-2.5 text-xs text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-lg transition-all cursor-pointer whitespace-nowrap"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
          <div className="hidden lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-4 px-5 py-3 border-b border-white/10 bg-white/[0.02]">
            {["Member", "Plan", "Status", "Expires", "In Gym", "Actions"].map(
              (h) => (
                <div
                  key={h}
                  className="text-[10px] font-semibold uppercase tracking-widest text-white/30"
                >
                  {h}
                </div>
              ),
            )}
          </div>

          {loading && (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
                    <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && fetchError && (
            <div className="px-5 py-12 text-center">
              <div className="text-red-400 text-sm mb-3">{fetchError}</div>
              <button
                onClick={fetchMembers}
                className="text-xs text-[#FF6B1A] hover:underline cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !fetchError && members.length === 0 && (
            <div className="px-5 py-16 text-center">
              <div className="text-4xl mb-3 opacity-20">◉</div>
              <div className="text-white/30 text-sm font-semibold">
                No members found
              </div>
              <div className="text-white/20 text-xs mt-1">
                {hasFilters
                  ? "Try adjusting your filters"
                  : 'Click "Add Member" to register your first member'}
              </div>
            </div>
          )}

          {!loading &&
            !fetchError &&
            members.map((m) => {
              const days = daysUntilExpiry(m.expiresAt);
              const expiringSoon = days > 0 && days <= 7;
              return (
                <div
                  key={m.gymId}
                  className="member-row grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-2 lg:gap-4 px-5 py-4 border-b border-white/5 last:border-0 transition-colors cursor-default"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
                      {getInitials(m.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {m.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-white/30 font-mono">
                          {m.gymId}
                        </span>
                        {m.balance > 0 && (
                          <button
                            onClick={() => setSettleTarget(m)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20 rounded transition-all cursor-pointer"
                          >
                            ₱{m.balance.toLocaleString()} owed
                          </button>
                        )}
                      </div>
                      {(m.email || m.phone) && (
                        <div className="text-[10px] text-white/20 truncate mt-0.5">
                          {m.email || m.phone}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex lg:items-center">
                    <span className="text-xs text-white/40 lg:hidden mr-2 w-14 shrink-0">
                      Plan
                    </span>
                    <span className="text-xs font-semibold text-white/70">
                      {m.plan}
                    </span>
                  </div>

                  <div className="flex lg:items-center">
                    <span className="text-xs text-white/40 lg:hidden mr-2 w-14 shrink-0">
                      Status
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_STYLES[m.status]}`}
                    >
                      {m.status}
                    </span>
                  </div>

                  <div className="flex lg:items-center">
                    <span className="text-xs text-white/40 lg:hidden mr-2 w-14 shrink-0">
                      Expires
                    </span>
                    <div>
                      <div
                        className={`text-xs font-mono ${expiringSoon ? "text-amber-400" : days < 0 ? "text-red-400" : "text-white/50"}`}
                      >
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

                  <div className="flex lg:items-center">
                    <span className="text-xs text-white/40 lg:hidden mr-2 w-14 shrink-0">
                      In gym
                    </span>
                    <span
                      className={`text-[10px] font-semibold ${m.checkedIn ? "text-[#FF6B1A]" : "text-white/20"}`}
                    >
                      {m.checkedIn ? "● Inside" : "○ Away"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditTarget(m);
                        setDrawerMode("edit");
                      }}
                      title="Edit member"
                      className="p-1.5 text-white/50 hover:text-blue-400 border border-white/10 hover:border-blue-400/40 rounded-md transition-all cursor-pointer"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                    {isOwner &&
                      (m.isActive ? (
                        <button
                          onClick={() =>
                            setConfirmState({ member: m, action: "deactivate" })
                          }
                          title="Deactivate member"
                          className="p-1.5 text-red-400/60 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 rounded-md transition-all cursor-pointer"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
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
                          className="p-1.5 text-emerald-400/60 hover:text-emerald-400 border border-emerald-400/20 hover:border-emerald-400/40 rounded-md transition-all cursor-pointer"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
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

          {!loading && !fetchError && members.length > 0 && (
            <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
              <span className="text-xs text-white/30">
                {total} member{total !== 1 ? "s" : ""}
                {hasFilters && (
                  <span className="ml-1 text-[#FF6B1A]/60">(filtered)</span>
                )}
              </span>
              <span className="text-xs text-white/20">
                Showing {Math.min((page - 1) * LIMIT + 1, total)}–
                {Math.min(page * LIMIT, total)} of {total}
              </span>
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1,
                )
                .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - (arr[idx - 1] as number) > 1)
                    acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "..." ? (
                    <span
                      key={`e-${i}`}
                      className="px-2 py-1.5 text-xs text-white/20"
                    >
                      ···
                    </span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${page === n ? "bg-[#FF6B1A]/15 text-[#FF6B1A] border-[#FF6B1A]/30" : "border-white/10 text-white/40 hover:text-white hover:border-white/20"}`}
                    >
                      {n}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {drawerMode && (
        <MemberDrawer
          mode={drawerMode}
          member={editTarget}
          onClose={() => {
            setDrawerMode(null);
            setEditTarget(undefined);
          }}
          onSaved={(savedMode, offlineMsg) =>
            handleSaved(savedMode, offlineMsg)
          }
        />
      )}

      {settleTarget &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setSettleTarget(null);
              setSettleAmount("");
            }}
          >
            <div
              className="w-full max-w-xs bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl"
              style={{ animation: "fadeScaleIn 0.2s ease" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-1">
                Settle Balance
              </div>
              <div className="text-white font-bold text-base mb-1">
                {settleTarget.name}
              </div>
              <div className="text-white/40 text-sm mb-4">
                Outstanding:{" "}
                <span className="text-amber-400 font-mono font-bold">
                  ₱{settleTarget.balance.toLocaleString()}
                </span>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["cash", "online"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSettleMethod(m)}
                      className={`py-2 rounded-lg border text-xs font-bold uppercase transition-all cursor-pointer ${settleMethod === m ? (m === "cash" ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]" : "border-blue-400 bg-blue-400/10 text-blue-400") : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"}`}
                    >
                      {m === "cash" ? "💵 Cash" : "🏦 Online"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Amount to Pay{" "}
                  <span className="text-white/20">(leave blank for full)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-mono">
                    ₱
                  </span>
                  <input
                    type="number"
                    value={settleAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val || Number(val) <= (settleTarget?.balance ?? 0))
                        setSettleAmount(val);
                    }}
                    placeholder={settleTarget?.balance.toLocaleString()}
                    max={settleTarget?.balance}
                    min={1}
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
                {settleAmount && Number(settleAmount) > 0 && settleTarget && (
                  <div className="mt-1.5 text-[10px]">
                    {Number(settleAmount) >= settleTarget.balance ? (
                      <span className="text-emerald-400">✓ Fully settled</span>
                    ) : (
                      <span className="text-amber-400">
                        ₱
                        {(
                          settleTarget.balance - Number(settleAmount)
                        ).toLocaleString()}{" "}
                        will remain outstanding
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSettleTarget(null);
                    setSettleAmount("");
                  }}
                  className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSettle}
                  disabled={settleLoading}
                  className="flex-1 py-2.5 bg-amber-400 text-black text-sm font-bold rounded-xl hover:bg-amber-300 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {settleLoading ? "Settling..." : "Settle ✓"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

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
    </>
  );
}
