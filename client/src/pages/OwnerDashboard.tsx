import { useEffect, useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import MembersPage from "./MembersPage";
import WalkInsPage from "./WalkInsPage";
import PaymentsPage from "./PaymentsPage";
import StaffPage from "./StaffPage";
import ReportsPage from "./ReportsPage";
import SettingsPage from "./SettingsPage";
import ActionLogPage from "./ActionLogPage";
import OwnerLayout from "../layouts/OwnerLayout";
import { useAuthStore } from "../store/authStore";
import { useGymStore } from "../store/gymStore";
import { memberService } from "../services/memberService";
import { offlineRenew } from "../lib/offlineService";
import type { AtRiskMember } from "../services/memberService";
import { paymentService } from "../services/paymentService";
import { walkInService } from "../services/walkInService";
import { useToastStore } from "../store/toastStore";
import { actionLogService } from "../services/actionLogService";
import type { ActionLog } from "../services/actionLogService";

// ─── Valid pages ──────────────────────────────────────────────────────────────
const VALID_PAGES = [
  "dashboard",
  "members",
  "walkins",
  "payments",
  "staff",
  "reports",
  "settings",
  "action-log",
] as const;
type PageKey = (typeof VALID_PAGES)[number];
function isValidPage(p: string | null): p is PageKey {
  return VALID_PAGES.includes(p as PageKey);
}

// ─── Action label helper ──────────────────────────────────────────────────────
function actionLabel(action: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    check_in: { label: "Check-in", color: "text-emerald-400" },
    check_out: { label: "Check-out", color: "text-blue-400" },
    member_created: { label: "New member", color: "text-[#FF6B1A]" },
    member_updated: { label: "Member update", color: "text-[#FFB800]" },
    member_deleted: { label: "Member removed", color: "text-red-400" },
    walk_in_created: { label: "Walk-in", color: "text-[#FFB800]" },
    walk_in_checkout: { label: "Walk-in out", color: "text-blue-400" },
    payment_created: { label: "Payment", color: "text-emerald-400" },
    settings_updated: { label: "Settings", color: "text-white/40" },
    login: { label: "Login", color: "text-white/40" },
    logout: { label: "Logout", color: "text-white/40" },
  };
  return map[action] ?? { label: action, color: "text-white/40" };
}

// ─── Dashboard cache key (module level) ──────────────────────────────────────
const DASH_CACHE_KEY = "gms:dashboard-cache";

// ─── Renew Modal ──────────────────────────────────────────────────────────────
function RenewModal({
  member,
  onClose,
  onSuccess,
}: {
  member: AtRiskMember;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useToastStore();
  const { getActivePlans, getPlanPrice, getPlanDuration } = useGymStore();
  const activePlans = getActivePlans();

  const [plan, setPlan] = useState(member.plan);
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const [amount, setAmount] = useState(String(getPlanPrice(member.plan)));
  const [saving, setSaving] = useState(false);

  const handlePlanChange = (newPlan: string) => {
    setPlan(newPlan);
    setAmount(String(getPlanPrice(newPlan)));
  };

  const calcNewExpiry = (selectedPlan: string): string => {
    const months = getPlanDuration(selectedPlan);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split("T")[0];
  };

  const handleRenew = async () => {
    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast("Please enter a valid amount.", "error");
      return;
    }
    setSaving(true);
    try {
      const planTotal = getPlanPrice(plan);
      const res = await offlineRenew(member.gymId, member.name, {
        plan,
        expiresAt: calcNewExpiry(plan),
        paymentMethod: method,
        amountPaid: parsedAmount,
        totalAmount: planTotal,
        status: "active",
      });
      showToast(
        res.queued
          ? res.message
          : `${member.name.split(" ")[0]}'s membership renewed successfully.`,
        "success",
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Renewal failed. Please try again.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const planTotal = getPlanPrice(plan);
  const parsedAmount = Number(amount);
  const isPartial =
    !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount < planTotal;
  const balanceOwed = isPartial ? planTotal - parsedAmount : 0;

  return createPortal(
    <>
      <style>{`
        @keyframes renewFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}>
        <div
          className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          style={{ animation: "renewFadeIn 0.2s ease" }}
          onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#FF6B1A] mb-0.5">
                Renew Membership
              </div>
              <div className="text-white font-bold text-base truncate">
                {member.name}
              </div>
              <div className="text-[10px] font-mono text-white/30 mt-0.5">
                {member.gymId} ·{" "}
                <span
                  className={
                    member.status === "overdue"
                      ? "text-red-400"
                      : "text-amber-400"
                  }>
                  {member.status === "overdue"
                    ? `${Math.abs(member.daysLeft)}d overdue`
                    : `${member.daysLeft}d left`}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer text-lg shrink-0">
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Plan
              </label>
              <div className="grid grid-cols-2 gap-2">
                {activePlans.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => handlePlanChange(p.name)}
                    className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                      plan === p.name
                        ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]"
                        : "border-white/10 bg-white/5 text-white/40 hover:border-white/20"
                    }`}>
                    <div className="text-xs font-bold">{p.name}</div>
                    <div className="text-[10px] font-mono mt-0.5">
                      ₱{p.price.toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">
                New expiry
              </span>
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                {new Date(calcNewExpiry(plan)).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Amount Paid
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-mono">
                  ₱
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                  placeholder="0"
                  min={0}
                />
              </div>
              {isPartial ? (
                <p className="text-[10px] text-amber-400 mt-1">
                  Partial — ₱{balanceOwed.toLocaleString()} will be added as
                  outstanding balance.
                </p>
              ) : (
                <p className="text-[10px] text-white/25 mt-1">
                  Pre-filled based on plan. Override if partial payment.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["cash", "online"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`py-2 rounded-lg border text-xs font-bold uppercase transition-all cursor-pointer ${
                      method === m
                        ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]"
                        : "border-white/10 bg-white/5 text-white/40 hover:border-white/20"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold rounded-xl transition-all cursor-pointer">
              Cancel
            </button>
            <button
              onClick={handleRenew}
              disabled={saving}
              className="flex-1 py-2.5 bg-[#FF6B1A] hover:bg-[#ff8a45] disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer">
              {saving ? "Renewing..." : "Confirm Renewal"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Owner Dashboard ──────────────────────────────────────────────────────────
export default function OwnerDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPage = searchParams.get("page");
  const activePage: PageKey = isValidPage(rawPage) ? rawPage : "dashboard";

  const setActivePage = (page: string) => {
    if (page === "dashboard") {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ page }, { replace: false });
    }
  };

  const pageTitles: Record<string, string> = {
    dashboard: "Dashboard",
    members: "Members",
    walkins: "Walk-ins",
    payments: "Payments",
    staff: "Staff",
    reports: "Reports",
    settings: "Settings",
    "action-log": "Action Log",
  };

  return (
    <OwnerLayout
      activePage={activePage}
      onPageChange={setActivePage}
      pageTitle={pageTitles[activePage] ?? "Dashboard"}>
      {activePage === "dashboard" && (
        <DashboardContent onNavigate={setActivePage} />
      )}
      {activePage === "members" && <MembersPage />}
      {activePage === "walkins" && <WalkInsPage />}
      {activePage === "payments" && <PaymentsPage />}
      {activePage === "staff" && <StaffPage />}
      {activePage === "reports" && <ReportsPage />}
      {activePage === "settings" && <SettingsPage />}
      {activePage === "action-log" && <ActionLogPage />}
    </OwnerLayout>
  );
}

// ─── Dashboard Content ────────────────────────────────────────────────────────
function DashboardContent({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { user } = useAuthStore();
  const { settings, getOwnerId } = useGymStore();
  const gymName = settings?.gymName || "the gym";

  const [memberStats, setMemberStats] = useState({
    total: 0,
    checkedIn: 0,
    expiringSoon: 0,
    withBalance: 0,
    loading: true,
  });
  const [paymentSummary, setPaymentSummary] = useState({
    monthRevenue: 0,
    todayRevenue: 0,
    loading: true,
  });
  const [walkInToday, setWalkInToday] = useState({
    count: 0,
    revenue: 0,
    stillInside: 0,
    loading: true,
  });
  const [recentCheckins, setRecentCheckins] = useState<
    { id: string; name: string; gymId: string }[]
  >([]);
  const [atRisk, setAtRisk] = useState<AtRiskMember[]>([]);
  const [atRiskLoading, setAtRiskLoading] = useState(true);
  const [renewTarget, setRenewTarget] = useState<AtRiskMember | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActionLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // ── Offline state ──────────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };
  const firstName = user?.name?.split(" ")[0] || "Owner";

  const load = useCallback(async () => {
    // ── Offline: read from cache and return early ─────────────────────────────
    if (!navigator.onLine) {
      try {
        const cached = localStorage.getItem(DASH_CACHE_KEY);
        if (cached) {
          const d = JSON.parse(cached);
          if (d.memberStats)
            setMemberStats({ ...d.memberStats, loading: false });
          if (d.paymentSummary)
            setPaymentSummary({ ...d.paymentSummary, loading: false });
          if (d.walkInToday)
            setWalkInToday({ ...d.walkInToday, loading: false });
          if (d.recentCheckins) setRecentCheckins(d.recentCheckins);
          if (d.atRisk) setAtRisk(d.atRisk);
          if (d.recentActivity) setRecentActivity(d.recentActivity);
        }
      } catch {
        /* ignore */
      }
      setAtRiskLoading(false);
      setActivityLoading(false);
      return;
    }

    // ── Online: fetch fresh data and write cache ───────────────────────────────
    const cacheData: Record<string, unknown> = {};

    try {
      const stats = await memberService.getMemberStats();
      const ms = {
        total: stats.total ?? 0,
        checkedIn: stats.checkedIn ?? 0,
        expiringSoon: stats.expiringSoon ?? 0,
        withBalance: stats.withBalance ?? 0,
      };
      setMemberStats({ ...ms, loading: false });
      cacheData.memberStats = ms;

      const checkedInRes = await memberService.getAll({
        checkedIn: "true",
        limit: 50,
      });
      const rc = checkedInRes.members.map((m) => ({
        id: m.gymId,
        name: m.name,
        gymId: m.gymId,
      }));
      setRecentCheckins(rc);
      cacheData.recentCheckins = rc;
    } catch {
      setMemberStats((s) => ({ ...s, loading: false }));
    }

    try {
      const res = await memberService.getAtRiskMembers();
      setAtRisk(res.atRisk);
      cacheData.atRisk = res.atRisk;
    } catch {
      setAtRisk([]);
    } finally {
      setAtRiskLoading(false);
    }

    try {
      const summary = await paymentService.getSummary();
      const ps = {
        monthRevenue: summary.month?.revenue ?? 0,
        todayRevenue: summary.today?.revenue ?? 0,
      };
      setPaymentSummary({ ...ps, loading: false });
      cacheData.paymentSummary = ps;
    } catch {
      setPaymentSummary((s) => ({ ...s, loading: false }));
    }

    try {
      const walkins = await walkInService.getToday();
      const wi = {
        count: walkins.summary?.total ?? 0,
        revenue: walkins.summary?.revenue ?? 0,
        stillInside:
          walkins.walkIns?.filter((w) => !w.isCheckedOut).length ?? 0,
      };
      setWalkInToday({ ...wi, loading: false });
      cacheData.walkInToday = wi;
    } catch {
      setWalkInToday((s) => ({ ...s, loading: false }));
    }

    try {
      const res = await actionLogService.getLogs({ limit: 5 });
      setRecentActivity(res.logs);
      cacheData.recentActivity = res.logs;
    } catch {
      setRecentActivity([]);
    } finally {
      setActivityLoading(false);
    }

    // Write everything to cache in one shot
    try {
      localStorage.setItem(DASH_CACHE_KEY, JSON.stringify(cacheData));
    } catch {
      /* ignore quota errors */
    }
  }, []);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    loadRef.current();
    const id = setInterval(() => loadRef.current(), 30000);
    return () => clearInterval(id);
  }, []);

  // ── Online/offline listener — auto-refresh on reconnect ───────────────────
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      load();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [load]);

  const fmt = (n: number) =>
    n >= 1000 ? `₱${(n / 1000).toFixed(1)}K` : `₱${n.toLocaleString()}`;

  const statCards = [
    {
      label: "Total Members",
      value:
        memberStats.loading || memberStats.total === undefined
          ? "—"
          : memberStats.total.toString(),
      sub: memberStats.loading ? "" : `${memberStats.checkedIn} inside now`,
      color: "text-[#FF6B1A]",
      border: "border-t-[#FF6B1A]",
      bg: "bg-[#FF6B1A]/5",
      onClick: () => onNavigate("members"),
    },
    {
      label: "Inside Now",
      value: memberStats.loading ? "—" : memberStats.checkedIn.toString(),
      sub: "Currently checked in",
      color: "text-[#FFB800]",
      border: "border-t-[#FFB800]",
      bg: "bg-[#FFB800]/5",
      onClick: () => onNavigate("members"),
    },
    {
      label: "Monthly Revenue",
      value: paymentSummary.loading ? "—" : fmt(paymentSummary.monthRevenue),
      sub: `Today: ${fmt(paymentSummary.todayRevenue)}`,
      color: "text-blue-400",
      border: "border-t-blue-400",
      bg: "bg-blue-400/5",
      onClick: () => onNavigate("payments"),
    },
    {
      label: "Expiring Soon",
      value: memberStats.loading ? "—" : memberStats.expiringSoon.toString(),
      sub: "Within 7 days",
      color: memberStats.expiringSoon > 0 ? "text-red-400" : "text-white/40",
      border:
        memberStats.expiringSoon > 0 ? "border-t-red-400" : "border-t-white/20",
      bg: memberStats.expiringSoon > 0 ? "bg-red-400/5" : "bg-white/[0.02]",
      onClick: () => onNavigate("members"),
    },
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-6 max-w-7xl mx-auto">
      {/* ── Offline banner ── */}
      {isOffline && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-400/10 border border-amber-400/20 rounded-xl">
          <span className="text-amber-400 text-base shrink-0">⚠</span>
          <div>
            <div className="text-amber-400 text-xs font-bold">
              You're offline
            </div>
            <div className="text-amber-400/70 text-[11px]">
              Showing last cached data. Live stats will resume when internet
              restores.
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {getGreeting()}, {firstName}! 👋
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            Here's what's happening at{" "}
            <span className="text-white/50 font-semibold">{gymName}</span>{" "}
            today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => window.open(`/kiosk?gym=${getOwnerId()}`, "_blank")}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 text-white/50 border border-white/10 text-xs font-bold rounded-lg hover:bg-white/10 hover:text-white/80 transition-all cursor-pointer"
            title="Opens kiosk in a new tab — safe to use on a dedicated tablet">
            <span className="text-sm leading-none">🖥</span> Kiosk
          </button>
          <button
            onClick={() => onNavigate("walkins")}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/25 text-xs font-bold rounded-lg hover:bg-[#FFB800]/20 transition-all cursor-pointer">
            <span className="text-sm leading-none">+</span> Walk-in
          </button>
          <button
            onClick={() => onNavigate("members")}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all cursor-pointer">
            <span className="text-sm leading-none">+</span> Add Member
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => (
          <button
            key={stat.label}
            onClick={stat.onClick}
            className={`${stat.bg} border border-white/10 border-t-2 ${stat.border} rounded-xl p-4 text-left transition-all hover:brightness-110 cursor-pointer`}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
              {stat.label}
            </div>
            <div
              className={`text-2xl sm:text-3xl font-bold ${stat.color} mb-1`}>
              {stat.value}
            </div>
            <div className="text-[11px] text-white/30">{stat.sub}</div>
          </button>
        ))}
      </div>

      {/* ── WALK-IN SUMMARY ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Walk-ins Today",
            value: walkInToday.loading ? "—" : walkInToday.count.toString(),
            sub: `${walkInToday.stillInside} still inside`,
            color: "text-[#FFB800]",
            border: "border-t-[#FFB800]",
            bg: "bg-[#FFB800]/5",
          },
          {
            label: "Walk-in Revenue",
            value: walkInToday.loading
              ? "—"
              : `₱${walkInToday.revenue.toLocaleString()}`,
            sub: "Day pass total",
            color: "text-[#FF6B1A]",
            border: "border-t-[#FF6B1A]",
            bg: "bg-[#FF6B1A]/5",
          },
          {
            label: "Outstanding Balances",
            value: memberStats.loading
              ? "—"
              : memberStats.withBalance.toString(),
            sub: "Members with unpaid balance",
            color:
              memberStats.withBalance > 0 ? "text-amber-400" : "text-white/40",
            border:
              memberStats.withBalance > 0
                ? "border-t-amber-400"
                : "border-t-white/20",
            bg:
              memberStats.withBalance > 0
                ? "bg-amber-400/5"
                : "bg-white/[0.02]",
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`${item.bg} border border-white/10 border-t-2 ${item.border} rounded-xl p-4`}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
              {item.label}
            </div>
            <div className={`text-xl sm:text-2xl font-bold ${item.color} mb-1`}>
              {item.value}
            </div>
            <div className="text-[11px] text-white/30">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* ── MAIN TWO-COLUMN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── MEMBERS INSIDE NOW ── */}
        <div
          className="lg:col-span-2 bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5 flex flex-col"
          style={{ minHeight: 200, maxHeight: 480 }}>
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Members Inside Now
            </h3>
          </div>

          {recentCheckins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
              <div className="text-3xl mb-2 opacity-20">◉</div>
              <div className="text-white/25 text-sm font-semibold">
                No members inside
              </div>
              <div className="text-white/15 text-xs mt-1">
                Members will appear here when checked in
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-1"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255,107,26,0.2) transparent",
              }}>
              {recentCheckins.map((m) => (
                <div
                  key={m.gymId}
                  className="flex items-center gap-3 p-3 bg-[#2a2a2a] rounded-lg border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
                    {m.name
                      .split(" ")
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {m.name}
                    </div>
                    <div className="text-[10px] font-mono text-white/30">
                      {m.gymId}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {recentCheckins.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-white/25">
                {memberStats.checkedIn} member
                {memberStats.checkedIn !== 1 ? "s" : ""} currently inside
                {recentCheckins.length > 10 && (
                  <span className="ml-1 text-[#FF6B1A]/50">
                    · scroll to see all
                  </span>
                )}
              </span>
              <button
                onClick={() => onNavigate("members")}
                className="text-[11px] text-[#FF6B1A] hover:text-[#ff8a45] transition-colors cursor-pointer">
                View all members →
              </button>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Revenue Breakdown */}
          <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
                Revenue Breakdown
              </h3>
              <button
                onClick={() => onNavigate("payments")}
                className="text-[11px] text-[#FF6B1A] hover:text-[#ff8a45] transition-colors cursor-pointer">
                View all →
              </button>
            </div>
            {paymentSummary.loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 bg-white/5 rounded animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  {
                    label: "Payments (today)",
                    amount: `₱${paymentSummary.todayRevenue.toLocaleString()}`,
                    color: "text-[#FF6B1A]",
                  },
                  {
                    label: "Walk-ins (today)",
                    amount: `₱${walkInToday.revenue.toLocaleString()}`,
                    color: "text-[#FFB800]",
                  },
                  {
                    label: "This month",
                    amount: fmt(paymentSummary.monthRevenue),
                    color: "text-blue-400",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-xs text-white/40">{row.label}</span>
                    <span
                      className={`text-xs font-mono font-semibold ${row.color}`}>
                      {row.amount}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-white/20 mt-1">
                  <span className="text-xs font-bold text-white">
                    Today Total
                  </span>
                  <span className="text-sm font-mono font-bold text-white">
                    ₱
                    {(
                      paymentSummary.todayRevenue + walkInToday.revenue
                    ).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* At-Risk Members */}
          <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
                At-Risk Members
              </h3>
              {atRiskLoading ? (
                <div className="w-12 h-4 bg-white/5 rounded animate-pulse" />
              ) : Array.isArray(atRisk) && atRisk.length > 0 ? (
                <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full font-semibold">
                  {atRisk.length}
                </span>
              ) : (
                <span className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full font-semibold">
                  ✓ All good
                </span>
              )}
            </div>

            {atRiskLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 bg-white/5 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : atRisk.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="text-2xl mb-1.5">✅</div>
                <div className="text-white/25 text-xs font-semibold">
                  No at-risk members
                </div>
                <div className="text-white/15 text-[11px] mt-0.5">
                  All memberships are in good standing
                </div>
              </div>
            ) : (
              <div
                className="space-y-2 overflow-y-auto pr-1"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(255,107,26,0.2) transparent",
                }}>
                {atRisk.map((member) => {
                  const expiresLabel = new Date(
                    member.expiresAt,
                  ).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <div
                      key={member.gymId}
                      className="flex items-center gap-2.5 p-2.5 bg-[#2a2a2a] rounded-lg border border-white/5">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.status === "overdue" ? "bg-red-400/10 text-red-400" : "bg-amber-400/10 text-amber-400"}`}>
                        {member.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {member.name}
                        </div>
                        <div
                          className={`text-[10px] ${member.status === "overdue" ? "text-red-400" : "text-amber-400"}`}>
                          {member.status === "overdue"
                            ? `Overdue since ${expiresLabel} · ${Math.abs(member.daysLeft)}d ago`
                            : `Expires ${expiresLabel} · ${member.daysLeft}d left`}
                        </div>
                      </div>
                      <button
                        onClick={() => setRenewTarget(member)}
                        className="shrink-0 px-2 py-1 text-[10px] font-bold text-[#FF6B1A] bg-[#FF6B1A]/10 hover:bg-[#FF6B1A]/20 border border-[#FF6B1A]/20 rounded-md transition-all cursor-pointer">
                        Renew
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RECENT ACTIVITY ── */}
      <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
            Recent Activity
          </h3>
          <button
            onClick={() => onNavigate("action-log")}
            className="text-[11px] text-[#FF6B1A] hover:text-[#ff8a45] transition-colors cursor-pointer">
            View all →
          </button>
        </div>

        {activityLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 bg-white/5 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="py-6 text-center text-white/25 text-xs">
            No activity yet
          </div>
        ) : (
          <div className="space-y-1">
            {recentActivity.map((log) => {
              const { label, color } = actionLabel(log.action);
              const time = new Date(log.timestamp).toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
              return (
                <div
                  key={log._id}
                  className="py-2 border-b border-white/5 last:border-0">
                  {/* Mobile: stacked */}
                  <div className="flex items-center justify-between gap-2 sm:hidden">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${color}`}>
                      {label}
                    </span>
                    <span className="text-[10px] font-mono text-white/25 shrink-0">
                      {time}
                    </span>
                  </div>
                  <div className="text-xs text-white/60 mt-0.5 sm:hidden break-words">
                    {log.detail}
                  </div>
                  {/* Desktop: single row */}
                  <div className="hidden sm:flex items-center gap-3">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider shrink-0 w-24 ${color}`}>
                      {label}
                    </span>
                    <span className="text-xs text-white/60 flex-1 truncate">
                      {log.detail}
                    </span>
                    <span className="text-[10px] font-mono text-white/25 shrink-0">
                      {time}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {renewTarget && (
        <RenewModal
          member={renewTarget}
          onClose={() => setRenewTarget(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
}
