import { useState, useEffect, useCallback } from "react";
import { actionLogService } from "../services/actionLogService";
import type { ActionLog } from "../services/actionLogService";
import api from "../services/api";
import { useGymStore } from "../store/gymStore";

const ACTION_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  check_in: {
    label: "Check-in",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
  check_out: {
    label: "Check-out",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
  },
  member_created: {
    label: "New member",
    color: "text-[#FF6B1A]",
    bg: "bg-[#FF6B1A]/10 border-[#FF6B1A]/20",
  },
  member_updated: {
    label: "Member update",
    color: "text-[#FFB800]",
    bg: "bg-[#FFB800]/10 border-[#FFB800]/20",
  },
  member_deleted: {
    label: "Removed",
    color: "text-red-400",
    bg: "bg-red-400/10 border-red-400/20",
  },
  walk_in_created: {
    label: "Walk-in",
    color: "text-[#FFB800]",
    bg: "bg-[#FFB800]/10 border-[#FFB800]/20",
  },
  walk_in_checkout: {
    label: "Walk-in out",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
  },
  payment_created: {
    label: "Payment",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
  settings_updated: {
    label: "Settings",
    color: "text-white/50",
    bg: "bg-white/5 border-white/10",
  },
  login: {
    label: "Login",
    color: "text-white/50",
    bg: "bg-white/5 border-white/10",
  },
  logout: {
    label: "Logout",
    color: "text-white/50",
    bg: "bg-white/5 border-white/10",
  },
};

const ACTION_TYPES = [
  { value: "", label: "All actions" },
  { value: "check_in", label: "Check-in" },
  { value: "check_out", label: "Check-out" },
  { value: "member_created", label: "New member" },
  { value: "member_updated", label: "Member update" },
  { value: "walk_in_created", label: "Walk-in" },
  { value: "walk_in_checkout", label: "Walk-in out" },
  { value: "payment_created", label: "Payment" },
  { value: "settings_updated", label: "Settings" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
];

interface StaffOption {
  _id: string;
  name: string;
  username: string;
}

export default function ActionLogPage() {
  const { getTimezone } = useGymStore();
  const timezone = getTimezone();

  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 15;

  const [filterAction, setFilterAction] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStaffId, setFilterStaffId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);

  // Load staff list once for the dropdown
  useEffect(() => {
    api
      .get("/auth/staff")
      .then((res) => setStaffList(res.data.staff ?? []))
      .catch(() => setStaffList([]));
  }, []);

  // When role switches away from staff, clear staff filter
  useEffect(() => {
    if (filterRole !== "staff") setFilterStaffId("");
  }, [filterRole]);

  // All filtering happens on the server — no client-side filtering
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await actionLogService.getLogs({
        page,
        limit,
        action: filterAction || undefined,
        role: filterRole || undefined,
        staffId: filterStaffId || undefined,
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
  }, [page, filterAction, filterRole, filterStaffId, filterFrom, filterTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  useEffect(() => {
    setPage(1);
  }, [filterAction, filterRole, filterStaffId, filterFrom, filterTo]);

  const totalPages = Math.ceil(total / limit);

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    });

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    });

  const clearFilters = () => {
    setFilterAction("");
    setFilterRole("");
    setFilterStaffId("");
    setFilterFrom("");
    setFilterTo("");
    setPage(1);
  };

  const hasFilters =
    filterAction || filterRole || filterStaffId || filterFrom || filterTo;

  return (
    <div className="space-y-4 pb-24 lg:pb-6 max-w-7xl mx-auto">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            Action Log
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            Full audit trail of all system activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer"
            >
              Clear filters
            </button>
          )}
          <span className="text-xs text-white/30 font-mono bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg">
            {total.toLocaleString()} entries
          </span>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="bg-[#212121] border border-white/10 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1.5">
            Action
          </label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors cursor-pointer"
          >
            {ACTION_TYPES.map((a) => (
              <option key={a.value} value={a.value} className="bg-[#2a2a2a]">
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1.5">
            Role
          </label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors cursor-pointer"
          >
            <option value="" className="bg-[#2a2a2a]">
              All roles
            </option>
            <option value="owner" className="bg-[#2a2a2a]">
              Owner
            </option>
            <option value="staff" className="bg-[#2a2a2a]">
              Staff
            </option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1.5">
            Staff member
          </label>
          <select
            value={filterStaffId}
            onChange={(e) => setFilterStaffId(e.target.value)}
            disabled={filterRole === "owner"}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <option value="" className="bg-[#2a2a2a]">
              All staff
            </option>
            {staffList.map((s) => (
              <option key={s._id} value={s._id} className="bg-[#2a2a2a]">
                {s.name} ({s.username})
              </option>
            ))}
          </select>
        </div>

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

      {/* ── TABLE ── */}
      <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_160px_100px] gap-4 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Action
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Detail
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Who
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30 text-right">
            When
          </span>
        </div>

        {loading ? (
          <div className="divide-y divide-white/5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[120px_1fr_160px_100px] gap-4 px-4 py-3"
              >
                {Array.from({ length: 4 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-5 bg-white/5 rounded animate-pulse"
                  />
                ))}
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-2 opacity-20">📋</div>
            <div className="text-white/25 text-sm font-semibold">
              No logs found
            </div>
            {hasFilters && (
              <div className="text-white/15 text-xs mt-1">
                Try clearing your filters
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map((log) => {
              const meta = ACTION_META[log.action] ?? {
                label: log.action,
                color: "text-white/40",
                bg: "bg-white/5 border-white/10",
              };
              return (
                <div
                  key={log._id}
                  className="grid grid-cols-[120px_1fr_160px_100px] gap-4 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${meta.color} ${meta.bg}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center min-w-0">
                    <span className="text-xs text-white/60 truncate">
                      {log.detail}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${log.performedBy.role === "owner" ? "bg-[#FF6B1A]/15 text-[#FF6B1A]" : "bg-white/10 text-white/50"}`}
                    >
                      {log.performedBy.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-white/70 truncate font-medium">
                        {log.performedBy.name}
                      </div>
                      <div className="text-[10px] text-white/25 capitalize">
                        {log.performedBy.role}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-center">
                    <span className="text-[10px] font-mono text-white/40">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className="text-[10px] text-white/20">
                      {formatDate(log.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
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
    </div>
  );
}
