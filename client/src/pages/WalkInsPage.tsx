/**
 * WalkInsPage.tsx
 * IronCore GMS — Walk-ins Management (Owner View)
 *
 * Features:
 *   - Today's summary cards (revenue, total, still inside, checked out)
 *   - Live walk-in table for today
 *   - History tab — browse by date or last 7 days
 *   - Pass type breakdown
 *   - Staff checkout action
 *
 * File location: client/src/pages/WalkInsPage.tsx
 */

import { useState, useEffect, useCallback } from "react";
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
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({
  summary,
  date,
}: {
  summary: WalkInSummary;
  date: string;
}) {
  const cards = [
    {
      label: "Total Revenue",
      value: `₱${summary.revenue.toLocaleString()}`,
      sub: `${summary.total} walk-in${summary.total !== 1 ? "s" : ""}`,
      color: "#FFB800",
      border: "border-t-[#FFB800]",
      bg: "bg-[#FFB800]/5",
    },
    {
      label: "Still Inside",
      value: String(summary.stillInside),
      sub: "currently in gym",
      color: "#FF6B1A",
      border: "border-t-[#FF6B1A]",
      bg: "bg-[#FF6B1A]/5",
      pulse: summary.stillInside > 0,
    },
    {
      label: "Checked Out",
      value: String(summary.checkedOut),
      sub: `of ${summary.total} total`,
      color: "#22c55e",
      border: "border-t-emerald-500",
      bg: "bg-emerald-500/5",
    },
    {
      label: "Pass Breakdown",
      value: `${summary.regular}R · ${summary.student}S · ${summary.couple}C`,
      sub: "regular · student · couple",
      color: "#888",
      border: "border-t-white/20",
      bg: "bg-white/[0.02]",
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
          {date === new Date().toISOString().split("T")[0]
            ? "Today's Summary"
            : `Summary for ${formatDate(date)}`}
        </div>
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
            <div className="text-[11px] text-white/30">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Walk-in Row ──────────────────────────────────────────────────────────────

interface WalkInRowProps {
  walkIn: WalkIn;
  onCheckOut?: (walkId: string) => void;
  isOwner?: boolean;
}

function WalkInRow({ walkIn, onCheckOut, isOwner }: WalkInRowProps) {
  const passColor = PASS_COLORS[walkIn.passType] ?? "#FFB800";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
      {/* Name + ID */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{
            background: `${passColor}18`,
            border: `1px solid ${passColor}40`,
            color: passColor,
          }}>
          {walkIn.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {walkIn.name}
          </div>
          <div className="text-[10px] font-mono text-white/30">
            {walkIn.walkId}
          </div>
        </div>
      </div>

      {/* Pass type */}
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
          {PASS_LABELS[walkIn.passType]}
        </span>
      </div>

      {/* Amount */}
      <div className="flex md:items-center">
        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
          Amount
        </span>
        <span className="text-sm font-mono font-semibold text-[#FFB800]">
          ₱{walkIn.amount}
        </span>
      </div>

      {/* Check-in time */}
      <div className="flex md:items-center">
        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
          In
        </span>
        <span className="text-xs font-mono text-white/60">
          {formatTime(walkIn.checkIn)}
        </span>
      </div>

      {/* Duration / Check-out */}
      <div className="flex md:items-center">
        <span className="text-xs text-white/40 md:hidden mr-2 w-16 shrink-0">
          Duration
        </span>
        {walkIn.isCheckedOut ? (
          <span className="text-xs font-mono text-white/40">
            {calcDuration(walkIn.checkIn, walkIn.checkOut)}
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

      {/* Action */}
      <div className="flex items-center">
        {!walkIn.isCheckedOut && isOwner && onCheckOut && (
          <button
            onClick={() => onCheckOut(walkIn.walkId)}
            className="px-2.5 py-1.5 text-[10px] font-semibold text-white/50 hover:text-white border border-white/10 hover:border-white/20 rounded-md transition-all cursor-pointer">
            Check Out
          </button>
        )}
        {walkIn.isCheckedOut && (
          <span className="text-[10px] text-white/20 font-mono">
            {walkIn.checkOut ? formatTime(walkIn.checkOut) : "—"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WalkInsPage() {
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");

  // Today state
  const [todayWalkIns, setTodayWalkIns] = useState<WalkIn[]>([]);
  const [todaySummary, setTodaySummary] = useState<WalkInSummary | null>(null);
  const [todayDate, setTodayDate] = useState("");
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState("");

  // History state
  const [historyWalkIns, setHistoryWalkIns] = useState<WalkIn[]>([]);
  const [historySummary, setHistorySummary] = useState<WalkInSummary | null>(
    null,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  const { showToast } = useToastStore();

  // ── Fetch today ────────────────────────────────────────────────────────────
  const fetchToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError("");
    try {
      const res = await walkInService.getToday();
      setTodayWalkIns(res.walkIns);
      setTodaySummary(res.summary);
      setTodayDate(res.date);
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
      const params: Record<string, string | number> = {
        page: historyPage,
        limit: 50,
      };
      if (historyDate) params.date = historyDate;

      const res = await walkInService.getHistory(params);
      setHistoryWalkIns(res.walkIns);
      setHistorySummary(res.summary);
      setHistoryTotal(res.total);
      setHistoryTotalPages(res.totalPages);
    } catch {
      setHistoryError("Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyDate, historyPage]);

  useEffect(() => {
    if (activeTab === "history") fetchHistory();
  }, [activeTab, fetchHistory]);

  // ── Staff checkout from owner view ─────────────────────────────────────────
  const handleCheckOut = async (walkId: string) => {
    try {
      await walkInService.checkOut(walkId);
      showToast(`${walkId} checked out successfully.`, "success");
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
          {/* Refresh button */}
          <button
            onClick={activeTab === "today" ? fetchToday : fetchHistory}
            className="flex items-center gap-2 px-3 py-2 border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-semibold rounded-lg transition-all cursor-pointer">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
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
              <div className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-white/2 border border-white/10 rounded-xl p-4 h-24 animate-pulse"
                    />
                  ))}
                </div>
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
              <SummaryCards summary={todaySummary} date={todayDate} />
            )}

            {!todayLoading && !todayError && (
              <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="hidden md:grid md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/10">
                  {["Guest", "Pass", "Amount", "Check-in", "Duration", ""].map(
                    (h) => (
                      <div
                        key={h}
                        className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                        {h}
                      </div>
                    ),
                  )}
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
                  todayWalkIns.map((w) => (
                    <WalkInRow
                      key={w._id}
                      walkIn={w}
                      onCheckOut={handleCheckOut}
                      isOwner={true}
                    />
                  ))
                )}

                {/* Footer total */}
                {todayWalkIns.length > 0 && todaySummary && (
                  <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
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
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === "history" && (
          <div className="space-y-5" style={{ animation: "fadeIn 0.2s ease" }}>
            {/* Date filter */}
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Filter by date
                </label>
                <input
                  type="date"
                  value={historyDate}
                  onChange={(e) => {
                    setHistoryDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="bg-[#212121] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-[#FFB800] transition-colors cursor-pointer"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              {historyDate && (
                <button
                  onClick={() => {
                    setHistoryDate("");
                    setHistoryPage(1);
                  }}
                  className="mt-5 px-3 py-2.5 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer">
                  Clear — Show last 7 days
                </button>
              )}
            </div>

            {/* History summary */}
            {!historyLoading && !historyError && historySummary && (
              <SummaryCards
                summary={historySummary}
                date={historyDate || "last-7-days"}
              />
            )}

            {/* History table */}
            <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
              <div className="hidden md:grid md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-white/10">
                {["Guest", "Pass", "Amount", "Date", "Duration", ""].map(
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
                      {historyDate
                        ? `No walk-ins on ${formatDate(historyDate)}`
                        : "No walk-ins in the last 7 days"}
                    </div>
                  </div>
                )}

              {!historyLoading &&
                !historyError &&
                historyWalkIns.map((w) => (
                  <div
                    key={w._id}
                    className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{
                          background: `${PASS_COLORS[w.passType] ?? "#FFB800"}18`,
                          border: `1px solid ${PASS_COLORS[w.passType] ?? "#FFB800"}40`,
                          color: PASS_COLORS[w.passType] ?? "#FFB800",
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
                          color: PASS_COLORS[w.passType] ?? "#FFB800",
                          background: `${PASS_COLORS[w.passType] ?? "#FFB800"}15`,
                          borderColor: `${PASS_COLORS[w.passType] ?? "#FFB800"}40`,
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
                        {w.isCheckedOut
                          ? calcDuration(w.checkIn, w.checkOut)
                          : "—"}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex md:items-center">
                      <span
                        className={`text-[10px] font-semibold ${w.isCheckedOut ? "text-white/20" : "text-[#FF6B1A]"}`}>
                        {w.isCheckedOut ? "Out" : "Inside"}
                      </span>
                    </div>
                  </div>
                ))}

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
    </>
  );
}
