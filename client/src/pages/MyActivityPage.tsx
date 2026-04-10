import { useState, useEffect, useCallback } from "react";
import { actionLogService } from "../services/actionLogService";
import type { ActionLog } from "../services/actionLogService";
import { useGymStore } from "../store/gymStore";

// ─── Action metadata — all dark-theme friendly colors ────────────────────────
const ACTION_META: Record<
  string,
  {
    label: string;
    dot: string;
    badgeColor: string;
    badgeBg: string;
    badgeBorder: string;
  }
> = {
  check_in: {
    label: "Check-in",
    dot: "#4ade80",
    badgeColor: "#4ade80",
    badgeBg: "rgba(74,222,128,0.1)",
    badgeBorder: "rgba(74,222,128,0.25)",
  },
  check_out: {
    label: "Check-out",
    dot: "#60a5fa",
    badgeColor: "#60a5fa",
    badgeBg: "rgba(96,165,250,0.1)",
    badgeBorder: "rgba(96,165,250,0.25)",
  },
  member_created: {
    label: "New member",
    dot: "#FF6B1A",
    badgeColor: "#FF6B1A",
    badgeBg: "rgba(255,107,26,0.1)",
    badgeBorder: "rgba(255,107,26,0.25)",
  },
  member_updated: {
    label: "Member update",
    dot: "#FFB800",
    badgeColor: "#FFB800",
    badgeBg: "rgba(255,184,0,0.1)",
    badgeBorder: "rgba(255,184,0,0.25)",
  },
  member_deleted: {
    label: "Removed",
    dot: "#f87171",
    badgeColor: "#f87171",
    badgeBg: "rgba(248,113,113,0.1)",
    badgeBorder: "rgba(248,113,113,0.25)",
  },
  walk_in_created: {
    label: "Walk-in",
    dot: "#FFB800",
    badgeColor: "#FFB800",
    badgeBg: "rgba(255,184,0,0.1)",
    badgeBorder: "rgba(255,184,0,0.25)",
  },
  walk_in_checkout: {
    label: "Walk-in out",
    dot: "#60a5fa",
    badgeColor: "#60a5fa",
    badgeBg: "rgba(96,165,250,0.1)",
    badgeBorder: "rgba(96,165,250,0.25)",
  },
  payment_created: {
    label: "Payment",
    dot: "#4ade80",
    badgeColor: "#4ade80",
    badgeBg: "rgba(74,222,128,0.1)",
    badgeBorder: "rgba(74,222,128,0.25)",
  },
  settings_updated: {
    label: "Settings",
    dot: "#a78bfa",
    badgeColor: "#a78bfa",
    badgeBg: "rgba(167,139,250,0.1)",
    badgeBorder: "rgba(167,139,250,0.25)",
  },
  login: {
    label: "Login",
    dot: "#a78bfa",
    badgeColor: "#a78bfa",
    badgeBg: "rgba(167,139,250,0.1)",
    badgeBorder: "rgba(167,139,250,0.25)",
  },
  logout: {
    label: "Logout",
    dot: "#94a3b8",
    badgeColor: "#94a3b8",
    badgeBg: "rgba(148,163,184,0.1)",
    badgeBorder: "rgba(148,163,184,0.25)",
  },
};

type DatePreset = "all" | "today" | "week" | "month" | "custom";

function getPresetDates(
  preset: DatePreset,
  timezone: string,
): { from: string; to: string } {
  // Format a Date as YYYY-MM-DD in the gym's configured timezone
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d);
  const today = new Date();
  if (preset === "today") {
    const s = fmt(today);
    return { from: s, to: s };
  }
  if (preset === "week") {
    const start = new Date(today.getTime() - 6 * 86400000);
    return { from: fmt(start), to: fmt(today) };
  }
  if (preset === "month") {
    const todayStr = fmt(today);
    return { from: todayStr.slice(0, 8) + "01", to: todayStr };
  }
  return { from: "", to: "" };
}

// Clean detail text:
// 1. Strip performer name from start
// 2. Fix login/logout — just show "Logged in" / "Logged out" cleanly
function cleanDetail(detail: string, name: string, action: string): string {
  if (action === "login") return "Logged in";
  if (action === "logout") return "Logged out";
  if (!name) return detail;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = detail.replace(new RegExp(`^${escaped}\\s+`, "i"), "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Group logs by date in the gym's configured timezone
function groupByDate(
  logs: ActionLog[],
  timezone: string,
): { label: string; date: string; logs: ActionLog[] }[] {
  const groups: Record<string, ActionLog[]> = {};
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString(
    "en-CA",
    { timeZone: timezone },
  );

  for (const log of logs) {
    const date = new Date(log.timestamp).toLocaleDateString("en-CA", {
      timeZone: timezone,
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const d = new Date(date + "T12:00:00");
      const formatted = d.toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: timezone,
      });
      let label = formatted;
      if (date === today)
        label = `Today — ${d.toLocaleDateString("en-PH", { month: "long", day: "numeric", timeZone: timezone })}`;
      if (date === yesterday)
        label = `Yesterday — ${d.toLocaleDateString("en-PH", { month: "long", day: "numeric", timeZone: timezone })}`;
      return { label, date, logs: items };
    });
}

export default function MyActivityPage() {
  const { getTimezone } = useGymStore();
  const timezone = getTimezone();

  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 100;

  const [preset, setPreset] = useState<DatePreset>("today");
  const [filterFrom, setFilterFrom] = useState(
    () => getPresetDates("today", timezone).from,
  );
  const [filterTo, setFilterTo] = useState(
    () => getPresetDates("today", timezone).to,
  );

  const handlePreset = (p: DatePreset) => {
    setPreset(p);
    if (p !== "custom") {
      const { from, to } = getPresetDates(p, timezone);
      setFilterFrom(from);
      setFilterTo(to);
    }
    setPage(1);
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await actionLogService.getLogs({
        page,
        limit,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setLogs(res.logs);
      setTotal(res.total);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, filterFrom, filterTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  useEffect(() => {
    setPage(1);
  }, [filterFrom, filterTo]);

  const totalPages = Math.ceil(total / limit);
  const grouped = groupByDate(logs, timezone);

  const stats = {
    checkins: logs.filter((l) => l.action === "check_in").length,
    walkins: logs.filter((l) => l.action === "walk_in_created").length,
    payments: logs.filter((l) => l.action === "payment_created").length,
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    });

  return (
    <div className="space-y-4 pb-24 lg:pb-6 max-w-2xl mx-auto">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            My Activity
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            Your personal action history
          </p>
        </div>
        <span className="text-xs text-white/30 font-mono bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
          {total.toLocaleString()} entries
        </span>
      </div>

      {/* ── DATE PRESETS ── */}
      <div className="bg-[#212121] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { key: "today", label: "Today" },
              { key: "week", label: "This week" },
              { key: "month", label: "This month" },
              { key: "all", label: "All time" },
              { key: "custom", label: "Custom" },
            ] as { key: DatePreset; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePreset(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                preset === key
                  ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]"
                  : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1.5">
                From
              </label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1.5">
                To
              </label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── SUMMARY STATS ── */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Check-ins",
              value: stats.checkins,
              color: "text-emerald-400",
              border: "border-t-emerald-400",
              bg: "bg-emerald-400/5",
            },
            {
              label: "Walk-ins",
              value: stats.walkins,
              color: "text-[#FFB800]",
              border: "border-t-[#FFB800]",
              bg: "bg-[#FFB800]/5",
            },
            {
              label: "Payments",
              value: stats.payments,
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
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TIMELINE FEED ── */}
      {loading ? (
        <div className="bg-[#212121] border border-white/10 rounded-xl p-5 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-white/10 mt-1 shrink-0 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-white/5 rounded animate-pulse w-24" />
                <div className="h-3 bg-white/5 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-white/5 rounded animate-pulse w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-[#212121] border border-white/10 rounded-xl py-16 text-center">
          <div className="text-3xl mb-2 opacity-20">📋</div>
          <div className="text-white/25 text-sm font-semibold">
            No activity found
          </div>
          <div className="text-white/15 text-xs mt-1">
            {preset === "all"
              ? "No actions have been logged yet"
              : "Try a different date range"}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ label, date, logs: dayLogs }) => (
            <div
              key={date}
              className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  {label}
                </span>
                <span className="ml-2 text-[10px] text-white/20">
                  {dayLogs.length} action{dayLogs.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="px-4 py-2">
                {dayLogs.map((log, idx) => {
                  const meta = ACTION_META[log.action] ?? {
                    label: log.action,
                    dot: "#64748b",
                    badgeColor: "#94a3b8",
                    badgeBg: "rgba(148,163,184,0.1)",
                    badgeBorder: "rgba(148,163,184,0.25)",
                  };
                  const detail = cleanDetail(
                    log.detail,
                    log.performedBy.name,
                    log.action,
                  );
                  const isLast = idx === dayLogs.length - 1;

                  return (
                    <div
                      key={log._id}
                      className="flex gap-3 py-3"
                      style={{
                        borderBottom: isLast
                          ? "none"
                          : "0.5px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      {/* Dot + line */}
                      <div
                        className="flex flex-col items-center pt-1 shrink-0"
                        style={{ width: 12 }}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: meta.dot }}
                        />
                        {!isLast && (
                          <div
                            className="w-px flex-1 mt-1"
                            style={{
                              background: "rgba(255,255,255,0.07)",
                              minHeight: 16,
                            }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                            style={{
                              color: meta.badgeColor,
                              background: meta.badgeBg,
                              border: `0.5px solid ${meta.badgeBorder}`,
                            }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[10px] font-mono text-white/25">
                            {formatTime(log.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed">
                          {detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PAGINATION ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-white/30">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs border border-white/10 text-white/50 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs border border-white/10 text-white/50 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
