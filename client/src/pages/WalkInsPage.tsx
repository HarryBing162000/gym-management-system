/**
 * WalkInsPage.tsx
 * IronCore GMS — Walk-ins Management (Owner View)
 *
 * Features:
 *   - Today tab: summary cards with yesterday comparison, staff "processed by", owner checkout
 *   - History tab: quick filters (This Week / This Month / Custom range)
 *   - Register modal: owner can register a walk-in directly from this page
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { walkInService } from "../services/walkInService";
import { useToastStore } from "../store/toastStore";
import type { WalkIn, WalkInSummary } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function calcDuration(checkIn: string, checkOut?: string): string {
  const end = checkOut ? new Date(checkOut) : new Date();
  const mins = Math.floor(
    (end.getTime() - new Date(checkIn).getTime()) / 60000,
  );
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function getWeekRange(): { from: string; to: string } {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: fmt(mon), to: fmt(sun) };
}
function getMonthRange(): { from: string; to: string } {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: fmt(from), to: fmt(to) };
}

const PASS_COLORS: Record<string, string> = {
  regular: "#FF6B1A",
  student: "#60a5fa",
  couple: "#c084fc",
};
const PASS_LABELS: Record<string, string> = {
  regular: "Regular",
  student: "Student",
  couple: "Couple",
};

// ─── Register Modal ───────────────────────────────────────────────────────────

interface RegisterModalProps {
  onClose: () => void;
  onRegistered: () => void;
}

function RegisterModal({ onClose, onRegistered }: RegisterModalProps) {
  const { showToast } = useToastStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [passType, setPassType] = useState<"regular" | "student" | "couple">(
    "regular",
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const passConfig = [
    { type: "regular" as const, label: "Regular", price: 150 },
    { type: "student" as const, label: "Student", price: 100 },
    { type: "couple" as const, label: "Couple", price: 250 },
  ];

  const formatPhone = (val: string) => {
    const d = val.replace(/\D/g, "").slice(0, 11);
    if (d.length > 7) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    if (d.length > 4) return `${d.slice(0, 4)} ${d.slice(4)}`;
    return d;
  };

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!name.trim() || name.trim().split(" ").length < 2) {
      setErrorMsg("Please enter a full name (first and last).");
      return;
    }
    setLoading(true);
    try {
      const res = await walkInService.register({
        name: name.trim(),
        phone: phone.trim() || undefined,
        passType,
      });
      showToast(
        `${res.walkIn.name.split(" ")[0]} registered — ${res.walkIn.walkId}`,
        "success",
      );
      onRegistered();
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setErrorMsg(
        err.response?.data?.message || "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <>
      <style>{`@keyframes regSlideIn { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}>
        <div
          className="w-full sm:max-w-sm bg-[#1e1e1e] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl"
          style={{ animation: "regSlideIn 0.25s ease" }}
          onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#FFB800] mb-0.5">
                New Walk-in
              </div>
              <div className="text-white font-bold text-base">
                Register Guest
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white flex items-center justify-center text-sm cursor-pointer">
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Full Name <span className="text-[#FF6B1A]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="e.g. Jose Rizal"
                autoFocus
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
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
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="09XX XXX XXXX"
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
              />
            </div>

            {/* Pass type */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Pass Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {passConfig.map(({ type, label, price }) => (
                  <button
                    key={type}
                    onClick={() => setPassType(type)}
                    className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                      passType === type
                        ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                        : "border-white/10 bg-[#2a2a2a] text-white/40 hover:border-white/20"
                    }`}>
                    <div className="text-xs font-bold uppercase">{label}</div>
                    <div className="text-xs font-mono mt-0.5">₱{price}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-xs">{errorMsg}</p>
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-2.5 bg-[#FFB800] text-black text-sm font-bold rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 disabled:opacity-50 cursor-pointer">
                {loading
                  ? "Registering..."
                  : `Register — ₱${passConfig.find((p) => p.type === passType)?.price}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  summary: WalkInSummary;
  date: string;
  yesterdayRevenue?: number | null;
  yesterdayTotal?: number | null;
}

function SummaryCards({
  summary,
  date,
  yesterdayRevenue,
  yesterdayTotal,
}: SummaryCardsProps) {
  const isToday =
    date ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
      new Date(),
    );
  const revDiff =
    yesterdayRevenue != null ? summary.revenue - yesterdayRevenue : null;
  const revUp = revDiff != null && revDiff >= 0;

  const cards = [
    {
      label: "Total Revenue",
      value: `₱${summary.revenue.toLocaleString()}`,
      sub:
        yesterdayRevenue != null
          ? revDiff === 0
            ? "Same as yesterday"
            : `${revUp ? "▲" : "▼"} ₱${Math.abs(revDiff!).toLocaleString()} vs yesterday (₱${yesterdayRevenue.toLocaleString()})`
          : `${summary.total} walk-in${summary.total !== 1 ? "s" : ""}`,
      color: "#FFB800",
      border: "border-t-[#FFB800]",
      bg: "bg-[#FFB800]/5",
      subColor:
        revDiff != null
          ? revUp
            ? "text-emerald-400"
            : "text-red-400"
          : "text-white/30",
    },
    {
      label: "Still Inside",
      value: String(summary.stillInside),
      sub: "currently in gym",
      color: "#FF6B1A",
      border: "border-t-[#FF6B1A]",
      bg: "bg-[#FF6B1A]/5",
      pulse: summary.stillInside > 0,
      subColor: "text-white/30",
    },
    {
      label: "Checked Out",
      value: String(summary.checkedOut),
      sub:
        yesterdayTotal != null
          ? `Yesterday: ${yesterdayTotal} total`
          : `of ${summary.total} total`,
      color: "#22c55e",
      border: "border-t-emerald-500",
      bg: "bg-emerald-500/5",
      subColor: "text-white/30",
    },
    {
      label: "Pass Breakdown",
      value: `${summary.regular}R · ${summary.student}S · ${summary.couple}C`,
      sub: "regular · student · couple",
      color: "#888",
      border: "border-t-white/20",
      bg: "bg-white/[0.02]",
      subColor: "text-white/30",
    },
  ];

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
        {isToday
          ? "Today's Summary"
          : date === "last-7-days"
            ? "Last 7 Days"
            : `Summary — ${formatDate(date)}`}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`${c.bg} border border-white/10 border-t-2 ${c.border} rounded-xl p-4`}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2">
              {c.label}
              {c.pulse && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#FF6B1A] inline-block"
                  style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
                />
              )}
            </div>
            <div
              className="text-2xl sm:text-3xl font-bold mb-1"
              style={{ color: c.color }}>
              {c.value}
            </div>
            <div className={`text-[11px] leading-tight ${c.subColor}`}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type QuickFilter = "week" | "month" | "custom";

export default function WalkInsPage() {
  const { showToast } = useToastStore();
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Today
  const [todayWalkIns, setTodayWalkIns] = useState<WalkIn[]>([]);
  const [todaySummary, setTodaySummary] = useState<WalkInSummary | null>(null);
  const [todayDate, setTodayDate] = useState("");
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState("");
  const [todayPage, setTodayPage] = useState(1);
  const TODAY_LIMIT = 10;

  // Yesterday comparison
  const [yesterdayRevenue, setYesterdayRevenue] = useState<number | null>(null);
  const [yesterdayTotal, setYesterdayTotal] = useState<number | null>(null);

  // History
  const [historyWalkIns, setHistoryWalkIns] = useState<WalkIn[]>([]);
  const [historySummary, setHistorySummary] = useState<WalkInSummary | null>(
    null,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // History filters
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ── Computed date range ────────────────────────────────────────────────────
  const getHistoryParams = useCallback((): Record<string, string | number> => {
    const params: Record<string, string | number> = {
      page: historyPage,
      limit: 10,
    };
    if (quickFilter === "week") {
      const { from, to } = getWeekRange();
      params.from = from;
      params.to = to;
    } else if (quickFilter === "month") {
      const { from, to } = getMonthRange();
      params.from = from;
      params.to = to;
    } else {
      if (customFrom) params.from = customFrom;
      if (customTo) params.to = customTo;
    }
    return params;
  }, [quickFilter, customFrom, customTo, historyPage]);

  // ── Fetch today + yesterday ────────────────────────────────────────────────
  const fetchToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError("");
    try {
      const [todayRes, yestRes] = await Promise.all([
        walkInService.getToday(),
        walkInService.getYesterdayRevenue(),
      ]);
      setTodayWalkIns(todayRes.walkIns);
      setTodaySummary(todayRes.summary);
      setTodayDate(todayRes.date);
      setYesterdayRevenue(yestRes.revenue);
      setYesterdayTotal(yestRes.total);
    } catch {
      setTodayError("Failed to load today's walk-ins.");
    } finally {
      setTodayLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  // Auto-refresh today every 30 seconds
  useEffect(() => {
    if (activeTab !== "today") return;
    const id = setInterval(fetchToday, 30000);
    return () => clearInterval(id);
  }, [activeTab, fetchToday]);

  // ── Fetch history ──────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await walkInService.getHistory(getHistoryParams());
      setHistoryWalkIns(res.walkIns);
      setHistorySummary(res.summary);
      setHistoryTotal(res.total);
      setHistoryTotalPages(res.totalPages);
    } catch {
      setHistoryError("Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [getHistoryParams]);

  useEffect(() => {
    if (activeTab === "history") fetchHistory();
  }, [activeTab, fetchHistory]);

  // Reset page when filter changes
  useEffect(() => {
    setHistoryPage(1);
  }, [quickFilter, customFrom, customTo]);

  // ── Owner checkout ─────────────────────────────────────────────────────────
  const handleCheckOut = async (walkId: string) => {
    try {
      await walkInService.checkOut(walkId);
      showToast(`${walkId} checked out.`, "success");
      fetchToday();
    } catch {
      showToast("Checkout failed. Please try again.", "error");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.8); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Walk-ins</h2>
            <p className="text-xs text-white/30 mt-0.5">
              Day pass visitors — regular, student, and couple
            </p>
          </div>
          <button
            onClick={() => setShowRegisterModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FFB800] text-black text-xs font-bold rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 cursor-pointer">
            <span className="text-base leading-none">+</span>
            Register Walk-in
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-[#212121] border border-white/10 rounded-lg p-1 w-fit">
          {(["today", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-md transition-all cursor-pointer ${
                activeTab === tab
                  ? "bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30"
                  : "text-white/40 hover:text-white/60"
              }`}>
              {tab === "today" ? "Today" : "History"}
            </button>
          ))}
        </div>

        {/* ── TODAY TAB ── */}
        {activeTab === "today" && (
          <div className="space-y-5" style={{ animation: "fadeIn 0.2s ease" }}>
            {todayLoading && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white/[0.02] border border-white/10 rounded-xl p-4 h-28 animate-pulse"
                  />
                ))}
              </div>
            )}

            {todayError && (
              <div className="px-5 py-8 text-center bg-[#212121] border border-white/10 rounded-xl">
                <div className="text-red-400 text-sm mb-2">{todayError}</div>
                <button
                  onClick={fetchToday}
                  className="text-xs text-[#FFB800] hover:underline cursor-pointer">
                  Try again
                </button>
              </div>
            )}

            {!todayLoading && !todayError && todaySummary && (
              <SummaryCards
                summary={todaySummary}
                date={todayDate}
                yesterdayRevenue={yesterdayRevenue}
                yesterdayTotal={yesterdayTotal}
              />
            )}

            {!todayLoading && !todayError && (
              <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
                {/* Table header — now includes "By" */}
                <div className="hidden md:grid md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/10">
                  {[
                    "Guest",
                    "Pass",
                    "Amount",
                    "Check-in",
                    "Duration",
                    "By",
                    "",
                  ].map((h) => (
                    <div
                      key={h}
                      className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                      {h}
                    </div>
                  ))}
                </div>

                {todayWalkIns.length === 0 ? (
                  <div className="px-5 py-16 text-center">
                    <div className="text-4xl mb-3 opacity-20">⊕</div>
                    <div className="text-white/30 text-sm font-semibold">
                      No walk-ins today
                    </div>
                    <div className="text-white/20 text-xs mt-1">
                      Walk-ins registered at the front desk will appear here
                    </div>
                  </div>
                ) : (
                  todayWalkIns
                    .slice(
                      (todayPage - 1) * TODAY_LIMIT,
                      todayPage * TODAY_LIMIT,
                    )
                    .map((w) => {
                      const passColor = PASS_COLORS[w.passType] ?? "#FFB800";
                      const staffName = w.staffId?.name ?? "—";

                      return (
                        <div
                          key={w._id}
                          className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                          {/* Guest */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{
                                background: `${passColor}18`,
                                border: `1px solid ${passColor}40`,
                                color: passColor,
                              }}>
                              {w.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white truncate">
                                {w.name}
                              </div>
                              <div className="text-[10px] font-mono text-white/30">
                                {w.walkId}
                              </div>
                            </div>
                          </div>

                          {/* Pass */}
                          <div className="flex md:items-center">
                            <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                              Pass
                            </span>
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide"
                              style={{
                                color: passColor,
                                background: `${passColor}15`,
                                borderColor: `${passColor}40`,
                              }}>
                              {PASS_LABELS[w.passType]}
                            </span>
                          </div>

                          {/* Amount */}
                          <div className="flex md:items-center">
                            <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                              Amount
                            </span>
                            <span className="text-sm font-mono font-semibold text-[#FFB800]">
                              ₱{w.amount}
                            </span>
                          </div>

                          {/* Check-in time */}
                          <div className="flex md:items-center">
                            <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                              In
                            </span>
                            <span className="text-xs font-mono text-white/60">
                              {formatTime(w.checkIn)}
                            </span>
                          </div>

                          {/* Duration */}
                          <div className="flex md:items-center">
                            <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                              Duration
                            </span>
                            {w.isCheckedOut ? (
                              <span className="text-xs font-mono text-white/40">
                                {calcDuration(w.checkIn, w.checkOut)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-[#FF6B1A] flex items-center gap-1">
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-[#FF6B1A] inline-block"
                                  style={{
                                    animation:
                                      "pulse-dot 2s ease-in-out infinite",
                                  }}
                                />
                                Inside
                              </span>
                            )}
                          </div>

                          {/* Processed by */}
                          <div className="flex md:items-center">
                            <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                              By
                            </span>
                            <span className="text-xs text-white/40 truncate">
                              {staffName}
                            </span>
                          </div>

                          {/* Action */}
                          <div className="flex items-center">
                            {!w.isCheckedOut ? (
                              <button
                                onClick={() => handleCheckOut(w.walkId)}
                                className="px-2.5 py-1.5 text-[10px] font-semibold text-white/50 hover:text-white border border-white/10 hover:border-white/20 rounded-md transition-all cursor-pointer">
                                Check Out
                              </button>
                            ) : (
                              <span className="text-[10px] text-white/20 font-mono">
                                {w.checkOut ? formatTime(w.checkOut) : "—"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}

                {/* Footer */}
                {todayWalkIns.length > 0 && todaySummary && (
                  <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-white/30">
                      {todaySummary.total} walk-in
                      {todaySummary.total !== 1 ? "s" : ""} today
                    </span>
                    <div className="flex items-center gap-3">
                      {todayWalkIns.length > TODAY_LIMIT && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-white/30 mr-1">
                            {(todayPage - 1) * TODAY_LIMIT + 1}–
                            {Math.min(
                              todayPage * TODAY_LIMIT,
                              todayWalkIns.length,
                            )}{" "}
                            of {todayWalkIns.length}
                          </span>
                          <button
                            onClick={() =>
                              setTodayPage((p) => Math.max(1, p - 1))
                            }
                            disabled={todayPage === 1}
                            className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                            ←
                          </button>
                          <button
                            onClick={() =>
                              setTodayPage((p) =>
                                Math.min(
                                  Math.ceil(todayWalkIns.length / TODAY_LIMIT),
                                  p + 1,
                                ),
                              )
                            }
                            disabled={
                              todayPage ===
                              Math.ceil(todayWalkIns.length / TODAY_LIMIT)
                            }
                            className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                            →
                          </button>
                        </div>
                      )}
                      <span className="text-sm font-mono font-bold text-[#FFB800]">
                        Total: ₱{todaySummary.revenue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <div className="space-y-5" style={{ animation: "fadeIn 0.2s ease" }}>
            {/* Quick filters */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { key: "week", label: "This Week" },
                    { key: "month", label: "This Month" },
                    { key: "custom", label: "Custom Range" },
                  ] as { key: QuickFilter; label: string }[]
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setQuickFilter(key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      quickFilter === key
                        ? "bg-[#FFB800]/15 text-[#FFB800] border-[#FFB800]/30"
                        : "bg-[#212121] text-white/40 border-white/10 hover:text-white hover:border-white/20"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Custom range inputs */}
              {quickFilter === "custom" && (
                <div className="flex flex-wrap gap-3 items-center">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#FFB800] transition-colors cursor-pointer"
                      style={{ colorScheme: "dark" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#FFB800] transition-colors cursor-pointer"
                      style={{ colorScheme: "dark" }}
                    />
                  </div>
                  {(customFrom || customTo) && (
                    <button
                      onClick={() => {
                        setCustomFrom("");
                        setCustomTo("");
                      }}
                      className="mt-5 px-3 py-2 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer">
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Summary */}
            {!historyLoading && !historyError && historySummary && (
              <SummaryCards summary={historySummary} date="last-7-days" />
            )}

            {/* History table */}
            <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
              <div className="hidden md:grid md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-white/10">
                {["Guest", "Pass", "Amount", "Date", "Duration", "By"].map(
                  (h) => (
                    <div
                      key={h}
                      className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                      {h}
                    </div>
                  ),
                )}
              </div>

              {historyLoading && (
                <div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-white/5 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-28 bg-white/5 rounded animate-pulse" />
                        <div className="h-2.5 w-16 bg-white/5 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {historyError && !historyLoading && (
                <div className="px-5 py-8 text-center">
                  <div className="text-red-400 text-sm mb-2">
                    {historyError}
                  </div>
                  <button
                    onClick={fetchHistory}
                    className="text-xs text-[#FFB800] hover:underline cursor-pointer">
                    Try again
                  </button>
                </div>
              )}

              {!historyLoading &&
                !historyError &&
                historyWalkIns.length === 0 && (
                  <div className="px-5 py-16 text-center">
                    <div className="text-4xl mb-3 opacity-20">⊕</div>
                    <div className="text-white/30 text-sm font-semibold">
                      No walk-ins found
                    </div>
                    <div className="text-white/20 text-xs mt-1">
                      Try adjusting the date range
                    </div>
                  </div>
                )}

              {!historyLoading &&
                !historyError &&
                historyWalkIns.map((w) => {
                  const passColor = PASS_COLORS[w.passType] ?? "#FFB800";
                  const staffName = w.staffId?.name ?? "—";
                  return (
                    <div
                      key={w._id}
                      className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-2 md:gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                      {/* Guest */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{
                            background: `${passColor}18`,
                            border: `1px solid ${passColor}40`,
                            color: passColor,
                          }}>
                          {w.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {w.name}
                          </div>
                          <div className="text-[10px] font-mono text-white/30">
                            {w.walkId}
                          </div>
                        </div>
                      </div>

                      {/* Pass */}
                      <div className="flex md:items-center">
                        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                          Pass
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide"
                          style={{
                            color: passColor,
                            background: `${passColor}15`,
                            borderColor: `${passColor}40`,
                          }}>
                          {PASS_LABELS[w.passType]}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className="flex md:items-center">
                        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                          Amount
                        </span>
                        <span className="text-sm font-mono font-semibold text-[#FFB800]">
                          ₱{w.amount}
                        </span>
                      </div>

                      {/* Date */}
                      <div className="flex md:items-center">
                        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                          Date
                        </span>
                        <div>
                          <div className="text-xs font-mono text-white/50">
                            {formatDate(w.checkIn)}
                          </div>
                          <div className="text-[10px] text-white/30">
                            {formatTime(w.checkIn)}
                          </div>
                        </div>
                      </div>

                      {/* Duration */}
                      <div className="flex md:items-center">
                        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                          Duration
                        </span>
                        <span className="text-xs font-mono text-white/40">
                          {w.isCheckedOut ? (
                            calcDuration(w.checkIn, w.checkOut)
                          ) : (
                            <span className="text-[#FF6B1A]">Inside</span>
                          )}
                        </span>
                      </div>

                      {/* Processed by */}
                      <div className="flex md:items-center">
                        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
                          By
                        </span>
                        <span className="text-xs text-white/40 truncate">
                          {staffName}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {/* Footer */}
              {!historyLoading &&
                historyWalkIns.length > 0 &&
                historySummary && (
                  <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-white/30">
                      {historyTotal} record{historyTotal !== 1 ? "s" : ""}
                    </span>
                    <span className="text-sm font-mono font-bold text-[#FFB800]">
                      Total: ₱{historySummary.revenue.toLocaleString()}
                    </span>
                  </div>
                )}
            </div>

            {/* Pagination */}
            {historyTotalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/30">
                  Page {historyPage} of {historyTotalPages}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                    ← Prev
                  </button>
                  <button
                    onClick={() =>
                      setHistoryPage((p) => Math.min(historyTotalPages, p + 1))
                    }
                    disabled={historyPage === historyTotalPages}
                    className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Register modal */}
      {showRegisterModal && (
        <RegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={fetchToday}
        />
      )}
    </>
  );
}
