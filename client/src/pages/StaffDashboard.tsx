import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuthStore } from "../store/authStore";
import StaffLayout from "../layouts/StaffLayout";
import { memberService } from "../services/memberService";
import type { AtRiskMember } from "../services/memberService";
import MembersPage from "./MembersPage";
import PaymentsPage from "./PaymentsPage";
import MyActivityPage from "./MyActivityPage";
import { walkInService } from "../services/walkInService";
import {
  offlineWalkInRegister,
  offlineWalkInCheckOut,
  offlineRenew,
} from "../lib/offlineService";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
import type { Member, WalkIn, WalkInRegisterResponse } from "../types";

// ─── Valid pages ──────────────────────────────────────────────────────────────
const VALID_PAGES = [
  "checkin",
  "walkin",
  "members",
  "payments",
  "my-activity",
] as const;
type PageKey = (typeof VALID_PAGES)[number];
function isValidPage(p: string | null): p is PageKey {
  return VALID_PAGES.includes(p as PageKey);
}

// ─── Staff dashboard cache key (module level) ─────────────────────────────────
const STAFF_DASH_CACHE_KEY = "gms:staff-dashboard-cache";

export default function StaffDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPage = searchParams.get("page");
  const activePage: PageKey = isValidPage(rawPage) ? rawPage : "checkin";

  const setActivePage = (page: string) => {
    if (page === "checkin") {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ page }, { replace: false });
    }
  };

  const pageTitles: Record<string, string> = {
    checkin: "Check-in Desk",
    walkin: "Walk-in Desk",
    members: "Members",
    payments: "Payments",
    "my-activity": "My Activity",
  };

  return (
    <StaffLayout
      activePage={activePage}
      onPageChange={setActivePage}
      pageTitle={pageTitles[activePage] ?? "Check-in Desk"}
    >
      {activePage === "checkin" && <CheckInDesk />}
      {activePage === "walkin" && <WalkInDesk />}
      {activePage === "members" && <MembersPage forceStaffView />}
      {activePage === "payments" && <PaymentsPage forceStaffView />}
      {activePage === "my-activity" && <MyActivityPage />}
    </StaffLayout>
  );
}

// ─── Staff Renew Modal ────────────────────────────────────────────────────────
function StaffRenewModal({
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
      const res = await offlineRenew(member.gymId, member.name, {
        plan,
        expiresAt: calcNewExpiry(plan),
        paymentMethod: method,
        amountPaid: parsedAmount,
        totalAmount: getPlanPrice(plan),
        status: "active",
      });
      showToast(
        res.queued
          ? res.message
          : `${member.name.split(" ")[0]}'s membership renewed.`,
        "success",
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Renewal failed.", "error");
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
      <style>{`@keyframes renewFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          style={{ animation: "renewFadeIn 0.2s ease" }}
          onClick={(e) => e.stopPropagation()}
        >
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
                  }
                >
                  {member.status === "overdue"
                    ? `${Math.abs(member.daysLeft)}d overdue`
                    : `${member.daysLeft}d left`}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer text-lg shrink-0"
            >
              ✕
            </button>
          </div>
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
                    className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${plan === p.name ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]" : "border-white/10 bg-white/5 text-white/40 hover:border-white/20"}`}
                  >
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
                  Partial — ₱{balanceOwed.toLocaleString()} outstanding balance.
                </p>
              ) : (
                <p className="text-[10px] text-white/25 mt-1">
                  Override if partial payment.
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
                    className={`py-2 rounded-lg border text-xs font-bold uppercase transition-all cursor-pointer ${method === m ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]" : "border-white/10 bg-white/5 text-white/40 hover:border-white/20"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="px-6 pb-6 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleRenew}
              disabled={saving}
              className="flex-1 py-2.5 bg-[#FF6B1A] hover:bg-[#ff8a45] disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              {saving ? "Renewing..." : "Confirm Renewal"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Check-in Desk ────────────────────────────────────────────────────────────
function CheckInDesk() {
  const LOG_PAGE_SIZE = 10;

  const { user } = useAuthStore();
  const { getOwnerId } = useGymStore();
  const { showToast } = useToastStore();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [todayLog, setTodayLog] = useState<
    { gymId: string; name: string; time: string; action: "in" | "out" }[]
  >([]);
  const [logPage, setLogPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [membersInside, setMembersInside] = useState(0);
  const [walkInsToday, setWalkInsToday] = useState(0);
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [atRisk, setAtRisk] = useState<AtRiskMember[]>([]);
  const [atRiskLoading, setAtRiskLoading] = useState(true);
  const [renewTarget, setRenewTarget] = useState<AtRiskMember | null>(null);

  // ── Offline state ────────────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const loadDashData = useCallback(async () => {
    // ── Offline: read from cache and return early ─────────────────────────────
    if (!navigator.onLine) {
      try {
        const cached = localStorage.getItem(STAFF_DASH_CACHE_KEY);
        if (cached) {
          const d = JSON.parse(cached);
          if (d.membersInside != null) setMembersInside(d.membersInside);
          if (d.walkInsToday != null) setWalkInsToday(d.walkInsToday);
          if (d.totalCheckins != null) setTotalCheckins(d.totalCheckins);
          if (d.atRisk) setAtRisk(d.atRisk);
          if (d.todayLog) setTodayLog(d.todayLog);
        }
      } catch {
        /* ignore */
      }
      setStatsLoading(false);
      setAtRiskLoading(false);
      return;
    }

    // ── Online: fetch fresh data and write cache ───────────────────────────────
    setStatsLoading(true);
    setAtRiskLoading(true);
    try {
      const [checkedInRes, walkInRes, atRiskRes] = await Promise.all([
        memberService.getAll({ checkedIn: "true", limit: 200 }),
        walkInService.getToday(),
        memberService.getAtRiskMembers(),
      ]);
      const inside = checkedInRes.members;
      const mi = inside.length;
      const wit = walkInRes.summary?.total ?? 0;
      const tc = mi + wit;
      const ar = atRiskRes.atRisk ?? [];
      const log = inside.map((m) => ({
        gymId: m.gymId,
        name: m.name,
        time: m.lastCheckIn
          ? new Date(m.lastCheckIn).toLocaleTimeString("en-PH", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : "—",
        action: "in" as const,
      }));

      setMembersInside(mi);
      setWalkInsToday(wit);
      setTotalCheckins(tc);
      setAtRisk(ar);
      if (inside.length > 0) setTodayLog(log);

      // Write cache
      try {
        localStorage.setItem(
          STAFF_DASH_CACHE_KEY,
          JSON.stringify({
            membersInside: mi,
            walkInsToday: wit,
            totalCheckins: tc,
            atRisk: ar,
            todayLog: log,
          }),
        );
      } catch {
        /* ignore quota errors */
      }
    } catch {
      /* silent */
    } finally {
      setStatsLoading(false);
      setAtRiskLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashData();
    inputRef.current?.focus();
  }, [loadDashData]);

  // ── Online/offline listener ───────────────────────────────────────────────
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      loadDashData();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [loadDashData]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      setSelected(null);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await memberService.getAll({
          search: search.trim(),
          limit: 6,
        });
        setResults(res.members);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const selectMember = (m: Member) => {
    setSelected(m);
    setSearch(m.name);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || actionLoading) return;
    if (selected) {
      if (selected.status === "expired" || selected.status === "inactive")
        return;
      if (selected.checkedIn) {
        handleCheckOut(selected);
      } else {
        handleCheckIn(selected);
      }
      return;
    }
    if (results.length === 1) selectMember(results[0]);
  };

  const handleCheckIn = async (member: Member) => {
    setActionLoading(true);
    try {
      await memberService.checkIn(member.gymId);
      showToast(`Welcome back, ${member.name.split(" ")[0]}! ✓`, "success");
      setTodayLog((prev) => [
        {
          gymId: member.gymId,
          name: member.name,
          time: new Date().toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          action: "in",
        },
        ...prev.filter((e) => !(e.gymId === member.gymId && e.action === "in")),
      ]);
      setMembersInside((n) => n + 1);
      setTotalCheckins((n) => n + 1);
      setLogPage(1);
      setSearch("");
      setSelected(null);
      setResults([]);
      inputRef.current?.focus();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast(err.response?.data?.message || "Check-in failed.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async (member: Member) => {
    setActionLoading(true);
    try {
      await memberService.checkOut(member.gymId);
      showToast(`${member.name.split(" ")[0]} checked out.`, "info");
      setTodayLog((prev) => [
        {
          gymId: member.gymId,
          name: member.name,
          time: new Date().toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          action: "out",
        },
        ...prev.filter((e) => !(e.gymId === member.gymId && e.action === "in")),
      ]);
      setMembersInside((n) => Math.max(0, n - 1));
      setLogPage(1);
      setSearch("");
      setSelected(null);
      setResults([]);
      inputRef.current?.focus();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast(err.response?.data?.message || "Check-out failed.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const STATUS_STYLES: Record<string, string> = {
    active: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    inactive: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    expired: "text-red-400 bg-red-400/10 border-red-400/20",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* ── Offline banner ── */}
      {isOffline && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-400/10 border border-amber-400/20 rounded-xl">
          <span className="text-amber-400 text-base shrink-0">⚠</span>
          <div>
            <div className="text-amber-400 text-xs font-bold">
              You're offline
            </div>
            <div className="text-amber-400/70 text-[11px]">
              Showing last cached data. Check-in and walk-in still work offline.
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">
            Welcome, {user?.name?.split(" ")[0]}! 👋
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            {new Date().toLocaleDateString("en-PH", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <button
          onClick={() => window.open(`/kiosk?gym=${getOwnerId()}`, "_blank")}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/5 text-white/50 border border-white/10 text-xs font-bold rounded-lg hover:bg-white/10 hover:text-white/80 transition-all cursor-pointer shrink-0"
          title="Opens kiosk in a new tab"
        >
          <span className="text-sm leading-none">🖥</span> Kiosk
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Members Inside",
            value: statsLoading ? "—" : String(membersInside),
            color: "text-[#FF6B1A]",
            border: "border-t-[#FF6B1A]",
            bg: "bg-[#FF6B1A]/5",
          },
          {
            label: "Walk-ins Today",
            value: statsLoading ? "—" : String(walkInsToday),
            color: "text-[#FFB800]",
            border: "border-t-[#FFB800]",
            bg: "bg-[#FFB800]/5",
          },
          {
            label: "Total Activity",
            value: statsLoading ? "—" : String(totalCheckins),
            color: "text-blue-400",
            border: "border-t-blue-400",
            bg: "bg-blue-400/5",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`${s.bg} border border-white/10 border-t-2 ${s.border} rounded-xl p-3`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">
              {s.label}
            </div>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-stretch">
        <div className="flex flex-col gap-5">
          {/* Member Lookup */}
          <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4">
              Member Lookup
            </h3>
            <div className="relative mb-3">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Name or GYM-ID... (Enter to select)"
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors pr-10"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setSelected(null);
                    setResults([]);
                    inputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            {searching && (
              <div className="text-center py-4 text-white/20 text-xs">
                Searching...
              </div>
            )}
            {!searching && results.length > 0 && !selected && (
              <div className="bg-[#2a2a2a] rounded-lg border border-white/10 mb-3 overflow-hidden">
                {results.length === 1 && (
                  <div className="px-4 py-1.5 bg-white/[0.02] border-b border-white/5 text-[10px] text-white/20">
                    Press Enter to select
                  </div>
                )}
                {results.map((m) => {
                  const isBlocked =
                    m.status === "expired" || m.status === "inactive";
                  return (
                    <button
                      key={m.gymId}
                      onClick={() => selectMember(m)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors text-left cursor-pointer ${isBlocked ? "opacity-60" : ""}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isBlocked ? "bg-red-400/10 border border-red-400/20 text-red-400" : "bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 text-[#FF6B1A]"}`}
                      >
                        {m.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {m.name}
                        </div>
                        <div className="text-xs text-white/30">
                          {m.gymId} · {m.plan}
                          {isBlocked && (
                            <span className="ml-1 text-red-400">
                              — Cannot check in
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[m.status] ?? "text-white/30"}`}
                        >
                          {m.status}
                        </span>
                        {m.checkedIn && (
                          <span className="text-[10px] text-[#FF6B1A]">
                            ● Inside
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {!searching &&
              search.trim() &&
              results.length === 0 &&
              !selected && (
                <div className="text-center py-6 text-white/20">
                  <div className="text-2xl mb-2">◉</div>
                  <div className="text-xs">No member found</div>
                </div>
              )}
            {selected && (
              <div
                className={`rounded-xl p-4 border mb-1 ${selected.checkedIn ? "bg-blue-400/5 border-blue-400/20" : "bg-[#FF6B1A]/5 border-[#FF6B1A]/20"}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/30 flex items-center justify-center text-sm font-bold text-[#FF6B1A] shrink-0">
                    {selected.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white">{selected.name}</div>
                    <div className="text-xs text-white/40">
                      {selected.gymId} · {selected.plan} · Expires{" "}
                      {new Date(selected.expiresAt).toLocaleDateString(
                        "en-PH",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[selected.status] ?? "text-white/30"}`}
                  >
                    {selected.status}
                  </span>
                </div>
                {selected.status === "expired" ||
                selected.status === "inactive" ? (
                  <button
                    disabled
                    className="w-full py-3 bg-transparent border border-amber-400/30 text-amber-400 text-sm font-bold rounded-lg cursor-not-allowed opacity-60"
                  >
                    ⚠ Membership {selected.status} — See Front Desk
                  </button>
                ) : selected.checkedIn ? (
                  <button
                    onClick={() => handleCheckOut(selected)}
                    disabled={actionLoading}
                    className="w-full py-3 bg-transparent border border-blue-400/40 text-blue-400 text-sm font-bold rounded-lg hover:bg-blue-400/10 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {actionLoading ? "Processing..." : "← Check Out"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleCheckIn(selected)}
                    disabled={actionLoading}
                    className="w-full py-3 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {actionLoading ? "Processing..." : "✓ Check In"}
                  </button>
                )}
              </div>
            )}
            {!search && !selected && (
              <div className="text-center py-6 text-white/20">
                <div className="text-xs">Type a name or GYM-ID to search</div>
              </div>
            )}
          </div>

          {/* At-Risk Members */}
          <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
                At-Risk Members
              </h3>
              {atRiskLoading ? (
                <div className="w-12 h-4 bg-white/5 rounded animate-pulse" />
              ) : atRisk.length > 0 ? (
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
                <div className="text-2xl mb-1.5 opacity-20">✓</div>
                <div className="text-white/25 text-xs font-semibold">
                  No at-risk members
                </div>
              </div>
            ) : (
              <div
                className="space-y-2 max-h-[240px] overflow-y-auto pr-1"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(255,107,26,0.2) transparent",
                }}
              >
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
                      className="flex items-center gap-2.5 p-2.5 bg-[#2a2a2a] rounded-lg border border-white/5"
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.status === "overdue" ? "bg-red-400/10 text-red-400" : "bg-amber-400/10 text-amber-400"}`}
                      >
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
                          className={`text-[10px] ${member.status === "overdue" ? "text-red-400" : "text-amber-400"}`}
                        >
                          {member.status === "overdue"
                            ? `Overdue since ${expiresLabel}`
                            : `Expires ${expiresLabel} · ${member.daysLeft}d left`}
                        </div>
                      </div>
                      <button
                        onClick={() => setRenewTarget(member)}
                        className="shrink-0 px-2 py-1 text-[10px] font-bold text-[#FF6B1A] bg-[#FF6B1A]/10 hover:bg-[#FF6B1A]/20 border border-[#FF6B1A]/20 rounded-md transition-all cursor-pointer"
                      >
                        Renew
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Today's Log */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Today's Log
            </h3>
            <span className="text-xs font-mono text-white/30">
              {todayLog.length} entries
            </span>
          </div>
          {todayLog.length === 0 ? (
            <div className="text-center py-10 text-white/20">
              <div className="text-2xl mb-2">◉</div>
              <div className="text-xs">No activity yet today</div>
            </div>
          ) : (
            <>
              <div className="space-y-0.5">
                {todayLog
                  .slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE)
                  .map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                    >
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${entry.action === "in" ? "bg-[#FF6B1A]" : "bg-blue-400"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-mono text-[#FF6B1A] mr-2">
                          {entry.gymId}
                        </span>
                        <span className="text-xs text-white/60 truncate">
                          {entry.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-semibold ${entry.action === "in" ? "text-[#FF6B1A]" : "text-blue-400"}`}
                        >
                          {entry.action === "in" ? "IN" : "OUT"}
                        </span>
                        <span className="text-[11px] font-mono text-white/30">
                          {entry.time}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
              {todayLog.length > LOG_PAGE_SIZE && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <span className="text-[10px] text-white/30">
                    {(logPage - 1) * LOG_PAGE_SIZE + 1}–
                    {Math.min(logPage * LOG_PAGE_SIZE, todayLog.length)} of{" "}
                    {todayLog.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      disabled={logPage === 1}
                      className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      ←
                    </button>
                    <button
                      onClick={() =>
                        setLogPage((p) =>
                          Math.min(
                            Math.ceil(todayLog.length / LOG_PAGE_SIZE),
                            p + 1,
                          ),
                        )
                      }
                      disabled={
                        logPage === Math.ceil(todayLog.length / LOG_PAGE_SIZE)
                      }
                      className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {renewTarget && (
        <StaffRenewModal
          member={renewTarget}
          onClose={() => setRenewTarget(null)}
          onSuccess={loadDashData}
        />
      )}
    </div>
  );
}

// ─── Walk-in Desk ─────────────────────────────────────────────────────────────
function WalkInDesk() {
  const { showToast } = useToastStore();
  const { getWalkInPrice } = useGymStore();
  const [tab, setTab] = useState<"register" | "checkout">("register");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [passType, setPassType] = useState<"regular" | "student" | "couple">(
    "regular",
  );
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<
    WalkInRegisterResponse["walkIn"] | null
  >(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [walkIns, setWalkIns] = useState<WalkIn[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const passConfig = [
    {
      type: "regular" as const,
      label: "Regular",
      price: getWalkInPrice("regular"),
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      ),
    },
    {
      type: "student" as const,
      label: "Student",
      price: getWalkInPrice("student"),
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      ),
    },
    {
      type: "couple" as const,
      label: "Couple",
      price: getWalkInPrice("couple"),
      icon: (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="7" r="3" />
          <circle cx="15" cy="7" r="3" />
          <path d="M2 20c0-3.3 3.1-6 7-6" />
          <path d="M22 20c0-3.3-3.1-6-7-6" />
          <path d="M9 14c1.7 1 4.3 1 6 0" />
        </svg>
      ),
    },
  ];

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length > 7)
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    if (digits.length > 4) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return digits;
  };

  useEffect(() => {
    if (tab !== "checkout") return;
    const load = async () => {
      setTodayLoading(true);
      try {
        const res = await walkInService.getToday();
        setWalkIns(res.walkIns);
      } catch {
        showToast("Failed to load today's walk-ins.", "error");
      } finally {
        setTodayLoading(false);
      }
    };
    load();
  }, [tab, showToast]);

  const handleRegister = async () => {
    if (loading) return;
    setErrorMsg("");
    if (!name.trim() || name.trim().split(" ").length < 2) {
      setErrorMsg("Please enter a full name (first and last).");
      return;
    }
    setLoading(true);
    try {
      const regRes = await offlineWalkInRegister({
        name: name.trim(),
        phone: phone.trim() || undefined,
        passType,
      });

      setSuccess({
        walkId: regRes.queued ? "QUEUED" : (regRes.walkId ?? "—"),
        name: name.trim(),
        passType,
        amount: getWalkInPrice(passType),
        checkIn: new Date().toISOString(),
        isCheckedOut: false,
      } as any);

      showToast(
        regRes.queued
          ? `${name.trim().split(" ")[0]} queued offline — will sync when internet restores.`
          : `${name.trim().split(" ")[0]} registered successfully.`,
        "success",
      );
    } catch (e) {
      const err = e as {
        response?: { status?: number; data?: { message?: string } };
      };
      setErrorMsg(
        err.response?.data?.message ||
          "Failed to register walk-in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async (walkId: string, guestName: string) => {
    setCheckingOut(walkId);
    try {
      const wcoRes = await offlineWalkInCheckOut(walkId, guestName);
      showToast(
        wcoRes.queued
          ? `${guestName.split(" ")[0]} checkout queued offline.`
          : `${guestName.split(" ")[0]} checked out.`,
        "info",
      );
      setWalkIns((prev) =>
        prev.map((w) =>
          w.walkId === walkId ? { ...w, isCheckedOut: true } : w,
        ),
      );
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast(err.response?.data?.message || "Checkout failed.", "error");
    } finally {
      setCheckingOut(null);
    }
  };

  const handleReset = () => {
    setName("");
    setPhone("");
    setPassType("regular");
    setSuccess(null);
    setErrorMsg("");
  };

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(handleReset, 6000);
    return () => clearTimeout(timer);
  }, [success]);

  const inside = walkIns.filter((w) => !w.isCheckedOut);
  const checkedOut = walkIns.filter((w) => w.isCheckedOut);

  return (
    <div className="max-w-md mx-auto pb-24 lg:pb-6 space-y-4">
      <div className="flex gap-1 bg-[#212121] border border-white/10 rounded-lg p-1">
        {(["register", "checkout"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSuccess(null);
              setErrorMsg("");
            }}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide rounded-md transition-all cursor-pointer ${tab === t ? "bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30" : "text-white/40 hover:text-white/60"}`}
          >
            {t === "register"
              ? "Register"
              : `Check Out${inside.length > 0 && tab === "checkout" ? ` (${inside.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "register" && (
        <>
          {success ? (
            <div className="bg-[#212121] border border-[#FF6B1A]/20 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[#FF6B1A]/10 border-2 border-[#FF6B1A] flex items-center justify-center text-2xl mx-auto mb-4">
                ✓
              </div>
              <h3 className="text-xl font-bold text-[#FF6B1A] mb-1">
                Welcome, {success.name.split(" ")[0]}!
              </h3>
              <p className="text-xs text-white/40 mb-5">
                Walk-in registered successfully
              </p>
              <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
                  Temporary ID
                </div>
                <div className="text-3xl font-mono font-bold text-[#FF6B1A] tracking-widest">
                  {success.walkId}
                </div>
              </div>
              <div className="space-y-2 mb-6 text-left">
                {[
                  { label: "Name", value: success.name },
                  {
                    label: "Pass Type",
                    value:
                      success.passType.charAt(0).toUpperCase() +
                      success.passType.slice(1),
                  },
                  { label: "Amount", value: `₱${success.amount}` },
                  {
                    label: "Check-in",
                    value: new Date(success.checkIn).toLocaleTimeString(
                      "en-PH",
                      { hour: "2-digit", minute: "2-digit" },
                    ),
                  },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-white/30">{row.label}</span>
                    <span className="font-semibold text-white">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleReset}
                className="w-full py-3 bg-[#FF6B1A] text-black font-bold text-sm rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer"
              >
                Register Another ➜
              </button>
              <p className="text-[10px] text-white/20 mt-2">
                Auto-resets in a few seconds
              </p>
            </div>
          ) : (
            <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-5">
                New Walk-in
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
                    Full Name <span className="text-[#FF6B1A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                    placeholder="e.g. Jose Rizal"
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
                    Phone <span className="text-white/20">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="09XX XXX XXXX"
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
                    Pass Type <span className="text-[#FF6B1A]">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {passConfig.map(({ type, icon, label, price }) => (
                      <button
                        key={type}
                        onClick={() => setPassType(type)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${passType === type ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]" : "border-white/10 bg-[#2a2a2a] text-white/40 hover:border-white/20"}`}
                      >
                        <div className="flex justify-center mb-1">{icon}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wide">
                          {label}
                        </div>
                        <div className="text-xs font-mono font-bold mt-1">
                          ₱{price}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                {errorMsg && (
                  <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-xs">{errorMsg}</p>
                  </div>
                )}
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="w-full py-3.5 bg-[#FFB800] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed mt-2 cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    `Register & Check In — ₱${passConfig.find((p) => p.type === passType)?.price} ➜`
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "checkout" && (
        <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">
              Today's Walk-ins
            </span>
            <span className="text-xs font-mono text-white/30">
              {inside.length} inside
            </span>
          </div>
          {todayLoading && (
            <div className="py-10 text-center text-white/20 text-xs">
              Loading...
            </div>
          )}
          {!todayLoading && inside.length === 0 && (
            <div className="py-10 text-center text-white/20">
              <div className="text-2xl mb-2">⊕</div>
              <div className="text-xs">No one currently inside</div>
            </div>
          )}
          {inside.map((w) => (
            <div
              key={w._id}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-white/5 last:border-0"
            >
              <div
                className="w-2 h-2 rounded-full bg-[#FF6B1A] shrink-0"
                style={{ animation: "pulse 2s infinite" }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {w.name}
                </div>
                <div className="text-[10px] text-white/30 font-mono">
                  {w.walkId} · {w.passType}
                </div>
              </div>
              <button
                onClick={() => handleCheckOut(w.walkId, w.name)}
                disabled={checkingOut === w.walkId}
                className="px-3 py-1.5 text-xs font-semibold border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {checkingOut === w.walkId ? "..." : "Check Out"}
              </button>
            </div>
          ))}
          {checkedOut.length > 0 && (
            <>
              <div className="px-5 py-2 bg-white/[0.02] border-t border-white/5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/20">
                  Already checked out
                </span>
              </div>
              {checkedOut.map((w) => (
                <div
                  key={w._id}
                  className="flex items-center gap-3 px-5 py-3 border-b border-white/5 last:border-0 opacity-40"
                >
                  <div className="w-2 h-2 rounded-full bg-white/20 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {w.name}
                    </div>
                    <div className="text-[10px] text-white/30 font-mono">
                      {w.walkId} · {w.passType}
                    </div>
                  </div>
                  <span className="text-[10px] text-white/30 font-mono">
                    Out
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
