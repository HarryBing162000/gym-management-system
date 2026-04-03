/**
 * SuperAdminAuditLogPage.tsx
 * GMS — Super Admin Audit Log Viewer
 *
 * Dedicated page at /superadmin/audit-log
 * Protected by SuperAdminRoute — requires valid superAdminStore token.
 *
 * Features:
 * - Full audit log table from MongoDB (persistent across restarts)
 * - Filter by action type, date range, gym name
 * - Pagination (50 per page)
 * - CSV export of current filtered results
 * - Back to dashboard link
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdminStore } from "../store/superAdminStore";
import { useIdleTimeout } from "../hooks/useIdleTimeout";
import { createPortal } from "react-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  _id: string;
  action: string;
  detail: string;
  ip: string;
  gymId?: string;
  timestamp: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "Login", color: "#22c55e" },
  login_locked: { label: "Login Locked", color: "#ef4444" },
  gym_created: { label: "Gym Created", color: "#60a5fa" },
  gym_suspended: { label: "Suspended", color: "#f59e0b" },
  gym_reactivated: { label: "Reactivated", color: "#22c55e" },
  gym_deleted: { label: "Deleted", color: "#ef4444" },
  gym_hard_deleted: { label: "Hard Deleted", color: "#ef4444" },
  billing_updated: { label: "Billing Updated", color: "#a78bfa" },
  password_reset: { label: "Password Reset", color: "#fb923c" },
  invite_resent: { label: "Invite Resent", color: "#38bdf8" },
  impersonation_started: { label: "Impersonation", color: "#FF6B1A" },
};

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

function downloadCSV(entries: AuditEntry[]) {
  const headers = ["Timestamp", "Action", "Detail", "IP", "Gym ID"];
  const rows = entries.map((e) => [
    formatTimestamp(e.timestamp),
    ACTION_LABELS[e.action]?.label ?? e.action,
    `"${e.detail.replace(/"/g, '""')}"`,
    e.ip,
    e.gymId ?? "—",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gms-audit-log-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Idle Warning Modal ──────────────────────────────────────────────────────

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
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⏱</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-1">
            Session Expiring
          </div>
          <div className="text-white font-black text-lg mb-1">Still there?</div>
          <div className="text-white/40 text-xs mb-4 leading-relaxed">
            You have been inactive. Your session will end in
          </div>
          <div
            className="text-5xl font-black mb-4 tabular-nums"
            style={{ color: secondsLeft <= 10 ? "#ef4444" : "#f59e0b" }}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdminAuditLogPage() {
  const navigate = useNavigate();
  const { token, logout, _hasHydrated } = useSuperAdminStore();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [gymSearch, setGymSearch] = useState("");
  const [page, setPage] = useState(1);

  // ── Idle timeout ───────────────────────────────────────────────────────────
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

  // ── Data ───────────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchLog = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (actionFilter !== "all") params.set("action", actionFilter);

      const res = await fetch(
        `${API}/api/superadmin/audit-log?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.status === 401) {
        logout();
        navigate("/superadmin");
        return;
      }

      const data = await res.json();
      if (!data.success) {
        setErrorMsg("Failed to load audit log.");
        return;
      }
      setEntries(data.log);
    } catch {
      setErrorMsg("Connection failed.");
    } finally {
      setLoading(false);
    }
  }, [token, actionFilter, logout, navigate]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token) {
      navigate("/superadmin");
      return;
    }
    fetchLog();
  }, [_hasHydrated, token, fetchLog, navigate]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [actionFilter, dateFrom, dateTo, gymSearch]);

  if (!_hasHydrated) return null;

  // ── Client-side filtering (date + gym search) ──────────────────────────────
  const filtered = entries.filter((e) => {
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (new Date(e.timestamp) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(e.timestamp) > to) return false;
    }
    if (gymSearch.trim()) {
      const q = gymSearch.toLowerCase();
      if (!e.detail.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <style>{`
        @keyframes saFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {showIdleWarning && (
        <IdleWarningModal
          secondsLeft={idleCountdown}
          onStayLoggedIn={handleIdleReset}
        />
      )}

      <div
        className="min-h-screen bg-[#1a1a1a]"
        style={{
          backgroundImage: `radial-gradient(ellipse 60% 40% at 10% 20%, rgba(255,184,0,0.03) 0%, transparent 60%)`,
        }}
      >
        {/* ── Topbar ── */}
        <div className="border-b border-white/10 bg-[#1a1a1a]/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/superadmin/dashboard")}
                className="text-white/30 hover:text-white text-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                ← Dashboard
              </button>
              <span className="text-white/10">|</span>
              <span className="text-[#FFB800] font-black text-sm tracking-widest uppercase">
                ⚡ Audit Log
              </span>
            </div>
            <button
              onClick={() => downloadCSV(filtered)}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-xs font-semibold rounded-lg transition-all disabled:opacity-30 cursor-pointer"
            >
              ↓ Export CSV
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {/* ── Header ── */}
          <div style={{ animation: "saFadeIn 0.3s ease" }}>
            <div className="text-white font-black text-xl mb-0.5">
              Super Admin Audit Log
            </div>
            <div className="text-white/30 text-xs">
              All actions performed in the GMS Control Panel — persisted to
              MongoDB.
            </div>
          </div>

          {/* ── Filters ── */}
          <div
            className="bg-[#212121] border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row gap-3 flex-wrap"
            style={{ animation: "saFadeIn 0.35s ease" }}
          >
            {/* Action filter */}
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Action
              </label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 outline-none focus:border-[#FFB800] transition-colors cursor-pointer"
                style={{ colorScheme: "dark" }}
              >
                <option value="all">All Actions</option>
                {Object.entries(ACTION_LABELS).map(([val, { label }]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 outline-none focus:border-[#FFB800] transition-colors"
                style={{ colorScheme: "dark" }}
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 outline-none focus:border-[#FFB800] transition-colors"
                style={{ colorScheme: "dark" }}
              />
            </div>

            {/* Gym search */}
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Search Detail / Gym
              </label>
              <input
                type="text"
                value={gymSearch}
                onChange={(e) => setGymSearch(e.target.value)}
                placeholder="e.g. Iron Gym, suspended..."
                className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
              />
            </div>

            {/* Clear filters */}
            {(actionFilter !== "all" || dateFrom || dateTo || gymSearch) && (
              <div className="flex flex-col justify-end">
                <button
                  onClick={() => {
                    setActionFilter("all");
                    setDateFrom("");
                    setDateTo("");
                    setGymSearch("");
                  }}
                  className="px-3 py-2 text-xs font-semibold text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* ── Results count ── */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/30">
              {loading ? "Loading..." : `${filtered.length} entries`}
              {filtered.length !== entries.length && !loading && (
                <span className="text-white/20">
                  {" "}
                  (filtered from {entries.length})
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="text-xs text-white/30">
                Page {page} of {totalPages}
              </div>
            )}
          </div>

          {/* ── Error ── */}
          {errorMsg && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {errorMsg}
            </div>
          )}

          {/* ── Table ── */}
          <div
            className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden"
            style={{ animation: "saFadeIn 0.4s ease" }}
          >
            {/* Header row */}
            <div
              className="hidden md:grid px-5 py-3 border-b border-white/10 bg-white/[0.02]"
              style={{ gridTemplateColumns: "160px 140px 1fr 120px" }}
            >
              {["Timestamp", "Action", "Detail", "IP"].map((h) => (
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
                <div className="w-6 h-6 border-2 border-white/10 border-t-[#FFB800] rounded-full animate-spin mx-auto mb-3" />
                <div className="text-white/20 text-xs">
                  Loading audit log...
                </div>
              </div>
            )}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
              <div className="py-16 text-center">
                <div className="text-4xl mb-3 opacity-20">📋</div>
                <div className="text-white/30 text-sm font-semibold">
                  {entries.length === 0
                    ? "No audit entries yet"
                    : "No results match your filters"}
                </div>
                {entries.length === 0 && (
                  <div className="text-white/20 text-xs mt-1">
                    Actions will appear here as you use the dashboard
                  </div>
                )}
              </div>
            )}

            {/* Rows */}
            {!loading &&
              paginated.map((entry, i) => {
                const meta = ACTION_LABELS[entry.action];
                return (
                  <div
                    key={entry._id}
                    className={`grid grid-cols-1 md:grid-cols-[160px_140px_1fr_120px] gap-2 md:gap-0 px-5 py-3.5 border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.015] ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}
                  >
                    {/* Timestamp */}
                    <div className="flex items-center">
                      <span className="text-[11px] font-mono text-white/35">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>

                    {/* Action badge */}
                    <div className="flex items-center">
                      <span
                        className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border"
                        style={{
                          color: meta?.color ?? "#9ca3af",
                          background: `${meta?.color ?? "#9ca3af"}15`,
                          borderColor: `${meta?.color ?? "#9ca3af"}35`,
                        }}
                      >
                        {meta?.label ?? entry.action}
                      </span>
                    </div>

                    {/* Detail */}
                    <div className="flex items-center min-w-0">
                      <span className="text-xs text-white/60 truncate">
                        {entry.detail}
                      </span>
                    </div>

                    {/* IP */}
                    <div className="flex items-center">
                      <span className="text-[11px] font-mono text-white/25 truncate">
                        {entry.ip}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 cursor-pointer"
              >
                ← Prev
              </button>

              {/* Page numbers — show max 7 around current */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2,
                )
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                    acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="text-white/20 text-xs"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`w-8 h-8 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        page === p
                          ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                          : "border-white/10 text-white/40 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 cursor-pointer"
              >
                Next →
              </button>
            </div>
          )}

          {/* ── Bottom padding ── */}
          <div style={{ height: "24px" }} />
        </div>
      </div>
    </>
  );
}
