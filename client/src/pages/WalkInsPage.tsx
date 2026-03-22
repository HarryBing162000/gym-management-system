/**
 * WalkInsPage.tsx
 * IronCore GMS — Walk-ins Management (Owner View)
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { walkInService } from "../services/walkInService";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
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
  if (mins < 1) return "< 1m";
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function getWeekRange(): { from: string; to: string } {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: fmt(mon), to: fmt(sun) };
}
function getMonthRange(): { from: string; to: string } {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
  const now = new Date();
  return {
    from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
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

function RegisterModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const { showToast } = useToastStore();
  const { getWalkInPrice } = useGymStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [passType, setPassType] = useState<"regular" | "student" | "couple">(
    "regular",
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const passConfig = [
    {
      type: "regular" as const,
      label: "Regular",
      price: getWalkInPrice("regular"),
    },
    {
      type: "student" as const,
      label: "Student",
      price: getWalkInPrice("student"),
    },
    {
      type: "couple" as const,
      label: "Couple",
      price: getWalkInPrice("couple"),
    },
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
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-sm bg-[#1e1e1e] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl"
          style={{ animation: "regSlideIn 0.25s ease" }}
          onClick={(e) => e.stopPropagation()}
        >
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
              className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white flex items-center justify-center text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="space-y-4">
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
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Pass Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {passConfig.map(({ type, label, price }) => (
                  <button
                    key={type}
                    onClick={() => setPassType(type)}
                    className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${passType === type ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]" : "border-white/10 bg-[#2a2a2a] text-white/40 hover:border-white/20"}`}
                  >
                    <div className="text-xs font-bold uppercase">{label}</div>
                    <div className="text-xs font-mono mt-0.5">₱{price}</div>
                  </button>
                ))}
              </div>
            </div>
            {errorMsg && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-xs">{errorMsg}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-2.5 bg-[#FFB800] text-black text-sm font-bold rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
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

function SummaryCards({
  summary,
  label,
  yesterdayRevenue,
  yesterdayTotal,
}: {
  summary: WalkInSummary;
  label: string;
  yesterdayRevenue?: number | null;
  yesterdayTotal?: number | null;
}) {
  const revDiff =
    yesterdayRevenue != null ? summary.revenue - yesterdayRevenue : null;
  const revUp = revDiff != null && revDiff >= 0;

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
        {label}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#FFB800]/5 border border-white/10 border-t-2 border-t-[#FFB800] rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
            Total Revenue
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#FFB800]">
            ₱{summary.revenue.toLocaleString()}
          </div>
          <div
            className={`text-[11px] leading-tight mt-1 ${revDiff != null ? (revUp ? "text-emerald-400" : "text-red-400") : "text-white/30"}`}
          >
            {yesterdayRevenue != null
              ? revDiff === 0
                ? "Same as yesterday"
                : `${revUp ? "▲" : "▼"} ₱${Math.abs(revDiff!).toLocaleString()} vs yesterday`
              : `${summary.total} walk-in${summary.total !== 1 ? "s" : ""}`}
          </div>
        </div>
        <div className="bg-[#FF6B1A]/5 border border-white/10 border-t-2 border-t-[#FF6B1A] rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2">
            Still Inside
            {summary.stillInside > 0 && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#FF6B1A] inline-block"
                style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
              />
            )}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-[#FF6B1A]">
            {summary.stillInside}
          </div>
          <div className="text-[11px] text-white/30 mt-1">currently in gym</div>
        </div>
        <div className="bg-emerald-500/5 border border-white/10 border-t-2 border-t-emerald-500 rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
            Checked Out
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-400">
            {summary.checkedOut}
          </div>
          <div className="text-[11px] text-white/30 mt-1">
            {yesterdayTotal != null
              ? `Yesterday: ${yesterdayTotal} total`
              : `of ${summary.total} total`}
          </div>
        </div>
        <div className="bg-white/[0.02] border border-white/10 border-t-2 border-t-white/20 rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-3">
            Pass Breakdown
          </div>
          <div className="flex flex-col gap-1.5">
            {(["regular", "student", "couple"] as const).map((type) => (
              <div key={type} className="flex items-center justify-between">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: PASS_COLORS[type] }}
                >
                  {PASS_LABELS[type]}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: PASS_COLORS[type] }}
                >
                  {summary[type]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Walk-in Row ──────────────────────────────────────────────────────────────

function WalkInRow({
  w,
  showDate = false,
  showCheckout = false,
  onCheckOut,
}: {
  w: WalkIn;
  showDate?: boolean;
  showCheckout?: boolean;
  onCheckOut?: (walkId: string) => void;
}) {
  const passColor = PASS_COLORS[w.passType] ?? "#FFB800";
  const staffName = w.staffId?.name ?? "—";

  return (
    <div
      className="walkin-row grid grid-cols-1 gap-2 px-5 py-4 border-b border-white/5 last:border-0 transition-colors cursor-default"
      style={{
        gridTemplateColumns: showDate
          ? "1.5fr 1fr 1fr 1fr 1fr 1fr 1fr"
          : "1.5fr 1fr 1fr 1fr 1fr 1fr auto",
      }}
    >
      {/* Guest */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{
            background: `${passColor}18`,
            border: `1px solid ${passColor}40`,
            color: passColor,
          }}
        >
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
          <div className="text-[10px] font-mono text-white/30">{w.walkId}</div>
        </div>
      </div>
      {/* Pass */}
      <div className="flex items-center">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide"
          style={{
            color: passColor,
            background: `${passColor}15`,
            borderColor: `${passColor}40`,
          }}
        >
          {PASS_LABELS[w.passType]}
        </span>
      </div>
      {/* Amount */}
      <div className="flex items-center">
        <span className="text-sm font-mono font-semibold text-[#FFB800]">
          ₱{w.amount}
        </span>
      </div>
      {/* Date or Time */}
      <div className="flex items-center">
        {showDate ? (
          <div>
            <div className="text-xs font-mono text-white/50">
              {formatDate(w.checkIn)}
            </div>
            <div className="text-[10px] text-white/30">
              {formatTime(w.checkIn)}
            </div>
          </div>
        ) : (
          <span className="text-xs font-mono text-white/60">
            {formatTime(w.checkIn)}
          </span>
        )}
      </div>
      {/* Duration */}
      <div className="flex items-center">
        {w.isCheckedOut ? (
          <span className="text-xs font-mono text-white/40">
            {calcDuration(w.checkIn, w.checkOut)}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-[#FF6B1A] flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#FF6B1A] inline-block"
              style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
            />
            Inside
          </span>
        )}
      </div>
      {/* Status (history only) */}
      {showDate && (
        <div className="flex items-center">
          {w.isCheckedOut ? (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
              Checked Out
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-[#FF6B1A] bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 px-2 py-0.5 rounded-full">
              Inside
            </span>
          )}
        </div>
      )}
      {/* By */}
      <div className="flex items-center">
        <span className="text-xs text-white/40 truncate">{staffName}</span>
      </div>
      {/* Action (today only) */}
      {showCheckout && (
        <div className="flex items-center">
          {!w.isCheckedOut ? (
            <button
              onClick={() => onCheckOut?.(w.walkId)}
              className="px-2.5 py-1.5 text-[10px] font-semibold text-white/50 hover:text-white border border-white/10 hover:border-white/20 rounded-md transition-all cursor-pointer"
            >
              Check Out
            </button>
          ) : (
            <span className="text-[10px] text-white/20 font-mono">
              {w.checkOut ? formatTime(w.checkOut) : "—"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (n: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce((acc: (number | string)[], n, idx, arr) => {
      if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("...");
      acc.push(n);
      return acc;
    }, []);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/30">
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          ← Prev
        </button>
        {pages.map((n, i) =>
          n === "..." ? (
            <span key={`e-${i}`} className="px-2 py-1.5 text-xs text-white/20">
              ···
            </span>
          ) : (
            <button
              key={n}
              onClick={() => onPage(n as number)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${page === n ? "bg-[#FFB800]/15 text-[#FFB800] border-[#FFB800]/30" : "border-white/10 text-white/40 hover:text-white hover:border-white/20"}`}
            >
              {n}
            </button>
          ),
        )}
        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          Next →
        </button>
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

  // Yesterday
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
  const [historySearch, setHistorySearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const getFilterLabel = (): string => {
    if (quickFilter === "week") return "This Week's Summary";
    if (quickFilter === "month") return "This Month's Summary";
    if (customFrom && customTo)
      return `Summary — ${formatDate(customFrom)} to ${formatDate(customTo)}`;
    if (customFrom) return `Summary — From ${formatDate(customFrom)}`;
    if (customTo) return `Summary — To ${formatDate(customTo)}`;
    return "Custom Range Summary";
  };

  const getHistoryParams = useCallback((): Record<string, string | number> => {
    const params: Record<string, string | number> = {
      page: historyPage,
      limit: 10,
    };
    if (historySearch.trim()) params.search = historySearch.trim();
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
  }, [quickFilter, customFrom, customTo, historyPage, historySearch]);

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
    fetchToday();
  }, [fetchToday]);
  useEffect(() => {
    if (activeTab !== "today") return;
    const id = setInterval(fetchToday, 30000);
    return () => clearInterval(id);
  }, [activeTab, fetchToday]);
  useEffect(() => {
    if (activeTab === "history") fetchHistory();
  }, [activeTab, fetchHistory]);
  useEffect(() => {
    setHistoryPage(1);
  }, [quickFilter, customFrom, customTo, historySearch]);

  const handleCheckOut = async (walkId: string) => {
    try {
      await walkInService.checkOut(walkId);
      showToast(`${walkId} checked out.`, "success");
      fetchToday();
    } catch {
      showToast("Checkout failed. Please try again.", "error");
    }
  };

  const todayIsToday =
    todayDate ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
      new Date(),
    );
  const todayTotalPages = Math.ceil(todayWalkIns.length / TODAY_LIMIT);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.8); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .walkin-row:nth-child(even) { background: rgba(255,255,255,0.012); }
        .walkin-row:hover { background: rgba(255,184,0,0.04) !important; }
      `}</style>

      <div className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Walk-ins</h2>
            <p className="text-xs text-white/30 mt-0.5">
              Day pass visitors — regular, student, and couple
            </p>
          </div>
          <button
            onClick={() => setShowRegisterModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FFB800] text-black text-xs font-bold rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            Register Walk-in
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#212121] border border-white/10 rounded-lg p-1 w-fit">
          {(["today", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-md transition-all cursor-pointer ${activeTab === tab ? "bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30" : "text-white/40 hover:text-white/60"}`}
            >
              {tab === "today" ? "Today" : "History"}
            </button>
          ))}
        </div>

        {/* ══ TODAY TAB ══ */}
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
                  className="text-xs text-[#FFB800] hover:underline cursor-pointer"
                >
                  Try again
                </button>
              </div>
            )}

            {!todayLoading && !todayError && todaySummary && (
              <SummaryCards
                summary={todaySummary}
                label={
                  todayIsToday
                    ? "Today's Summary"
                    : `Summary — ${formatDate(todayDate)}`
                }
                yesterdayRevenue={yesterdayRevenue}
                yesterdayTotal={yesterdayTotal}
              />
            )}

            {!todayLoading && !todayError && (
              <>
                {/* Table */}
                <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
                  <div
                    className="hidden md:grid gap-4 px-5 py-3 border-b border-white/10 bg-white/[0.02]"
                    style={{
                      gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr auto",
                    }}
                  >
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
                        className="text-[10px] font-semibold uppercase tracking-widest text-white/30"
                      >
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
                      .map((w) => (
                        <WalkInRow
                          key={w._id}
                          w={w}
                          showCheckout
                          onCheckOut={handleCheckOut}
                        />
                      ))
                  )}

                  {todayWalkIns.length > 0 && todaySummary && (
                    <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
                      <span className="text-xs text-white/30">
                        {todaySummary.total} walk-in
                        {todaySummary.total !== 1 ? "s" : ""} today
                      </span>
                      <span className="text-sm font-mono font-bold text-[#FFB800]">
                        Total: ₱{todaySummary.revenue.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Today Pagination */}
                <Pagination
                  page={todayPage}
                  totalPages={todayTotalPages}
                  total={todayWalkIns.length}
                  onPage={setTodayPage}
                />
              </>
            )}
          </div>
        )}

        {/* ══ HISTORY TAB ══ */}
        {activeTab === "history" && (
          <div className="space-y-5" style={{ animation: "fadeIn 0.2s ease" }}>
            {/* Filters */}
            <div className="bg-[#212121] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-48">
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
                      stroke="#FFB800"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M12.5 12.5L16 16"
                      stroke="#FFB800"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search by guest name..."
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
                  />
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      { key: "week", label: "This Week" },
                      { key: "month", label: "This Month" },
                      { key: "custom", label: "Custom" },
                    ] as { key: QuickFilter; label: string }[]
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setQuickFilter(key)}
                      className={`px-3 py-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${quickFilter === key ? "bg-[#FFB800]/15 text-[#FFB800] border-[#FFB800]/30" : "bg-[#2a2a2a] text-white/40 border-white/10 hover:text-white hover:border-white/20"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch("")}
                    className="px-3 py-2.5 text-xs text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-lg transition-all cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {quickFilter === "custom" && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">
                    Date:
                  </span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none focus:border-[#FFB800] transition-colors cursor-pointer"
                    style={{ colorScheme: "dark" }}
                  />
                  <span className="text-white/20 text-xs">→</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none focus:border-[#FFB800] transition-colors cursor-pointer"
                    style={{ colorScheme: "dark" }}
                  />
                  {(customFrom || customTo) && (
                    <button
                      onClick={() => {
                        setCustomFrom("");
                        setCustomTo("");
                      }}
                      className="text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>

            {!historyLoading && !historyError && historySummary && (
              <SummaryCards summary={historySummary} label={getFilterLabel()} />
            )}

            {/* History table */}
            <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
              <div
                className="hidden md:grid gap-4 px-5 py-3 border-b border-white/10 bg-white/[0.02]"
                style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1fr 1fr" }}
              >
                {[
                  "Guest",
                  "Pass",
                  "Amount",
                  "Date",
                  "Duration",
                  "Status",
                  "By",
                ].map((h) => (
                  <div
                    key={h}
                    className="text-[10px] font-semibold uppercase tracking-widest text-white/30"
                  >
                    {h}
                  </div>
                ))}
              </div>

              {historyLoading && (
                <div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0"
                    >
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
                    className="text-xs text-[#FFB800] hover:underline cursor-pointer"
                  >
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
                      {historySearch
                        ? "Try a different name"
                        : "Try adjusting the date range"}
                    </div>
                  </div>
                )}

              {!historyLoading &&
                !historyError &&
                historyWalkIns.map((w) => (
                  <WalkInRow key={w._id} w={w} showDate />
                ))}

              {!historyLoading &&
                historyWalkIns.length > 0 &&
                historySummary && (
                  <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
                    <span className="text-xs text-white/30">
                      {historyTotal} record{historyTotal !== 1 ? "s" : ""}
                    </span>
                    <span className="text-sm font-mono font-bold text-[#FFB800]">
                      Total: ₱{historySummary.revenue.toLocaleString()}
                    </span>
                  </div>
                )}
            </div>

            {/* History Pagination */}
            <Pagination
              page={historyPage}
              totalPages={historyTotalPages}
              total={historyTotal}
              onPage={setHistoryPage}
            />
          </div>
        )}
      </div>

      {showRegisterModal && (
        <RegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={fetchToday}
        />
      )}
    </>
  );
}
