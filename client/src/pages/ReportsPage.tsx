/**
 * ReportsPage.tsx
 * IronCore GMS — Owner Reports
 *
 * Sections:
 *   1. Revenue Report   — totals, cash vs online, daily trend
 *   2. Member Report    — active/expired/inactive, loyalty duration, outstanding
 *   3. Walk-in Report   — pass breakdown, repeat visitors
 *   4. Staff Report     — payments + walk-ins processed per staff
 *
 * Export: Print-to-PDF via window.print() with print-specific CSS
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { memberService } from "../services/memberService";
import { paymentService } from "../services/paymentService";
import { walkInService } from "../services/walkInService";
import { useGymStore } from "../store/gymStore";
import type { Member } from "../types";
import type { Payment } from "../services/paymentService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getManilaDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    d,
  );
}

function getMemberDuration(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - created.getFullYear()) * 12 +
    (now.getMonth() - created.getMonth());
  if (totalMonths < 1) return "< 1 month";
  if (totalMonths < 12)
    return `${totalMonths} month${totalMonths !== 1 ? "s" : ""}`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""}`;
  return `${years}y ${months}m`;
}

function getMemberDurationMonths(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return (
    (now.getFullYear() - created.getFullYear()) * 12 +
    (now.getMonth() - created.getMonth())
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  inactive: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  expired: "text-red-400 bg-red-400/10 border-red-400/20",
};

// ─── Date range helper ────────────────────────────────────────────────────────

type RangePreset = "today" | "week" | "month" | "custom";

function getRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const today = getManilaDate();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const now = new Date();
    const dow = now.getDay();
    const mondayOffset = (dow + 6) % 7;
    return { from: getManilaDate(mondayOffset), to: today };
  }
  if (preset === "month") {
    const now = new Date();
    const from = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date(now.getFullYear(), now.getMonth(), 1));
    return { from, to: today };
  }
  return { from: customFrom || today, to: customTo || today };
}

// ─── Mini bar chart (CSS only, no library) ────────────────────────────────────

function BarChart({
  data,
  color = "#FF6B1A",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 flex flex-col items-center gap-1 min-w-0"
        >
          <div
            className="w-full rounded-t-sm transition-all"
            style={{
              height: `${Math.max(4, (d.value / max) * 72)}px`,
              background: color,
              opacity: d.value === 0 ? 0.15 : 0.85,
            }}
          />
          <span className="text-[8px] text-white/30 truncate w-full text-center">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden report-section">
      <div className="px-5 py-4 border-b border-white/10 bg-white/[0.02] flex items-center gap-2.5">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-1.5">
        {label}
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { settings } = useGymStore();
  const gymName = settings?.gymName || "IronCore GMS";

  // Date range
  const [preset, setPreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState(getManilaDate(30));
  const [customTo, setCustomTo] = useState(getManilaDate());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Revenue data
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [cashRevenue, setCashRevenue] = useState(0);
  const [onlineRevenue, setOnlineRevenue] = useState(0);
  const [dailyRevenue, setDailyRevenue] = useState<
    { label: string; value: number }[]
  >([]);

  // Member data
  const [members, setMembers] = useState<Member[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [newThisMonth, setNewThisMonth] = useState(0);

  // Walk-in data
  const [walkInTotal, setWalkInTotal] = useState(0);
  const [walkInRevenue, setWalkInRevenue] = useState(0);
  const [regularCount, setRegularCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [coupleCount, setCoupleCount] = useState(0);

  // Staff data
  const [staffStats, setStaffStats] = useState<
    { name: string; payments: number; amount: number; walkIns: number }[]
  >([]);

  const range = getRange(preset, customFrom, customTo);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ── Revenue ──
      const payRes = await paymentService.getAll({
        from: range.from,
        to: range.to,
        limit: 500,
        page: 1,
      });
      const allPayments = payRes.payments;
      setPayments(allPayments);

      const total = allPayments.reduce(
        (s, p) => s + (p.amountPaid ?? p.amount),
        0,
      );
      const cash = allPayments
        .filter((p) => p.method === "cash")
        .reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);
      const online = allPayments
        .filter((p) => p.method === "online")
        .reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);
      setTotalRevenue(total);
      setCashRevenue(cash);
      setOnlineRevenue(online);

      // Daily revenue trend — last 7 days or range
      const days = 7;
      const trend = Array.from({ length: days }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        const label = d.toLocaleDateString("en-PH", { weekday: "short" });
        const dateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Manila",
        }).format(d);
        const value = allPayments
          .filter((p) => p.createdAt?.startsWith(dateStr))
          .reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);
        return { label, value };
      });
      setDailyRevenue(trend);

      // Staff performance from payments
      const staffMap: Record<
        string,
        { name: string; payments: number; amount: number; walkIns: number }
      > = {};
      allPayments.forEach((p) => {
        const name = p.processedBy?.name ?? "Unknown";
        if (!staffMap[name])
          staffMap[name] = { name, payments: 0, amount: 0, walkIns: 0 };
        staffMap[name].payments += 1;
        staffMap[name].amount += p.amountPaid ?? p.amount;
      });

      // ── Walk-ins ──
      try {
        const wiRes = await walkInService.getHistory({
          from: range.from,
          to: range.to,
          limit: 500,
          page: 1,
        });
        setWalkInTotal(wiRes.summary?.total ?? 0);
        setWalkInRevenue(wiRes.summary?.revenue ?? 0);
        setRegularCount(wiRes.summary?.regular ?? 0);
        setStudentCount(wiRes.summary?.student ?? 0);
        setCoupleCount(wiRes.summary?.couple ?? 0);

        // Add walk-in staff counts
        wiRes.walkIns?.forEach((w) => {
          const name = w.staffId?.name ?? "Unknown";
          if (!staffMap[name])
            staffMap[name] = { name, payments: 0, amount: 0, walkIns: 0 };
          staffMap[name].walkIns += 1;
        });
      } catch {
        /* walk-ins may fail silently */
      }

      setStaffStats(
        Object.values(staffMap).sort((a, b) => b.amount - a.amount),
      );

      // ── Members ──
      const [activeRes, inactiveRes, expiredRes, allRes] = await Promise.all([
        memberService.getAll({ status: "active", limit: 500 }),
        memberService.getAll({ status: "inactive", limit: 500 }),
        memberService.getAll({ status: "expired", limit: 500 }),
        memberService.getAll({ limit: 500 }),
      ]);
      const allMembers = allRes.members;
      setMembers(allMembers);
      setActiveCount(activeRes.total);
      setInactiveCount(inactiveRes.total);
      setExpiredCount(expiredRes.total);

      const rangeFrom = new Date(range.from);
      const rangeTo = new Date(range.to);
      rangeTo.setHours(23, 59, 59, 999); // include full end day
      setNewThisMonth(
        allMembers.filter((m) => {
          const created = new Date(m.createdAt);
          return created >= rangeFrom && created <= rangeTo;
        }).length,
      );
    } catch (err) {
      console.error("Reports fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  const fetchRef = useRef(fetchAll);
  useEffect(() => {
    fetchRef.current = fetchAll;
  }, [fetchAll]);
  useEffect(() => {
    fetchRef.current();
  }, [range.from, range.to]);

  // ── PDF Export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      window.print();
      setExporting(false);
    }, 300);
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const totalMembers = activeCount + inactiveCount + expiredCount;
  const loyalMembers = members
    .filter((m) => getMemberDurationMonths(m.createdAt) >= 6)
    .sort(
      (a, b) =>
        getMemberDurationMonths(b.createdAt) -
        getMemberDurationMonths(a.createdAt),
    );
  const newMembers = members.filter((m) => {
    const created = new Date(m.createdAt);
    const from = new Date(range.from);
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    return created >= from && created <= to;
  });
  const membersWithBalance = members.filter((m) => m.balance > 0);
  const cashPct =
    totalRevenue > 0 ? Math.round((cashRevenue / totalRevenue) * 100) : 0;
  const onlinePct = 100 - cashPct;

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .report-section { border: 1px solid #ddd !important; background: white !important; page-break-inside: avoid; margin-bottom: 16px; }
          .print-header { display: block !important; }
          * { color: black !important; background: white !important; border-color: #ddd !important; }
          .text-white, .text-white\\/30, .text-white\\/40, .text-white\\/50 { color: #333 !important; }
          .text-\\[\\#FF6B1A\\], .text-\\[\\#FFB800\\], .text-emerald-400, .text-blue-400, .text-amber-400, .text-red-400 { color: #333 !important; }
        }

        .print-header { display: none; }
      `}</style>

      {/* Print header — only shows on PDF */}
      <div className="print-header mb-6">
        <div className="text-2xl font-bold">{gymName} — Reports</div>
        <div className="text-sm text-gray-500">
          Period: {formatDate(range.from)} — {formatDate(range.to)} · Generated:{" "}
          {new Date().toLocaleString("en-PH")}
        </div>
      </div>

      <div
        className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-5"
        style={{ animation: "fadeIn 0.2s ease" }}
      >
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 no-print">
          <div>
            <h2 className="text-lg font-bold text-white">Reports</h2>
            <p className="text-xs text-white/30 mt-0.5">
              Business insights for{" "}
              <span className="text-white/50 font-semibold">{gymName}</span>
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={loading || exporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {exporting ? (
              <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            Export PDF
          </button>
        </div>

        {/* ── Date Range Filters ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4 no-print">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">
              Period:
            </span>
            {(
              [
                { key: "today", label: "Today" },
                { key: "week", label: "This Week" },
                { key: "month", label: "This Month" },
                { key: "custom", label: "Custom" },
              ] as { key: RangePreset; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPreset(key)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  preset === key
                    ? "bg-[#FF6B1A]/15 text-[#FF6B1A] border-[#FF6B1A]/30"
                    : "bg-[#2a2a2a] text-white/40 border-white/10 hover:text-white hover:border-white/20"
                }`}
              >
                {label}
              </button>
            ))}

            {preset === "custom" && (
              <>
                <div className="w-px h-5 bg-white/10" />
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
                  style={{ colorScheme: "dark" }}
                />
                <span className="text-white/20 text-xs">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
                  style={{ colorScheme: "dark" }}
                />
              </>
            )}

            <div className="ml-auto text-[10px] text-white/25 font-mono">
              {formatDate(range.from)} → {formatDate(range.to)}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#212121] border border-white/10 rounded-xl h-48 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            {/* ══ 1. REVENUE REPORT ══ */}
            <Section title="Revenue Report" icon="💰">
              <div className="space-y-5">
                {/* Top stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatPill
                    label="Total Revenue"
                    value={`₱${totalRevenue.toLocaleString()}`}
                    color="text-[#FF6B1A]"
                  />
                  <StatPill
                    label="Cash"
                    value={`₱${cashRevenue.toLocaleString()}`}
                    color="text-[#FFB800]"
                  />
                  <StatPill
                    label="Online"
                    value={`₱${onlineRevenue.toLocaleString()}`}
                    color="text-blue-400"
                  />
                  <StatPill
                    label="Walk-in Revenue"
                    value={`₱${walkInRevenue.toLocaleString()}`}
                    color="text-purple-400"
                  />
                </div>

                {/* Cash vs Online bar */}
                {totalRevenue > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
                      Cash vs Online Split
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-white/[0.06] flex gap-0.5">
                      <div
                        className="bg-[#FFB800] rounded-full transition-all"
                        style={{ width: `${cashPct}%` }}
                      />
                      <div className="bg-blue-400 rounded-full flex-1 transition-all" />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px]">
                      <span className="text-[#FFB800] font-semibold">
                        {cashPct}% Cash
                      </span>
                      <span className="text-blue-400 font-semibold">
                        {onlinePct}% Online
                      </span>
                    </div>
                  </div>
                )}

                {/* Daily trend */}
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">
                    7-Day Revenue Trend
                  </div>
                  <BarChart data={dailyRevenue} color="#FF6B1A" />
                </div>

                {/* Payment breakdown by type */}
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
                    By Payment Type
                  </div>
                  <div className="space-y-1.5">
                    {(
                      [
                        "new_member",
                        "renewal",
                        "manual",
                        "balance_settlement",
                      ] as const
                    ).map((type) => {
                      const typeLabels: Record<string, string> = {
                        new_member: "New Member",
                        renewal: "Renewal",
                        manual: "Manual",
                        balance_settlement: "Settlement",
                      };
                      const typePayments = payments.filter(
                        (p) => p.type === type,
                      );
                      const typeTotal = typePayments.reduce(
                        (s, p) => s + (p.amountPaid ?? p.amount),
                        0,
                      );
                      if (typePayments.length === 0) return null;
                      return (
                        <div
                          key={type}
                          className="flex items-center justify-between py-1.5 border-b border-white/[0.05] last:border-0"
                        >
                          <span className="text-xs text-white/50">
                            {typeLabels[type]}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-white/25">
                              {typePayments.length} payments
                            </span>
                            <span className="text-xs font-mono font-semibold text-[#FFB800]">
                              ₱{typeTotal.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>

            {/* ══ 2. MEMBER REPORT ══ */}
            <Section title="Member Report" icon="👥">
              <div className="space-y-5">
                {/* Top stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatPill
                    label="Total Members"
                    value={totalMembers}
                    color="text-white"
                  />
                  <StatPill
                    label="Active"
                    value={activeCount}
                    color="text-emerald-400"
                  />
                  <StatPill
                    label="Expired"
                    value={expiredCount}
                    color="text-red-400"
                  />
                  <StatPill
                    label="New This Month"
                    value={newThisMonth}
                    color="text-blue-400"
                  />
                </div>

                {/* Outstanding balances */}
                {membersWithBalance.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
                      Outstanding Balances — {membersWithBalance.length} member
                      {membersWithBalance.length !== 1 ? "s" : ""}
                    </div>
                    <div className="space-y-1.5">
                      {membersWithBalance.slice(0, 5).map((m) => (
                        <div
                          key={m.gymId}
                          className="flex items-center justify-between py-1.5 border-b border-white/[0.05] last:border-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-[9px] font-bold text-amber-400 shrink-0">
                              {m.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white truncate">
                                {m.name}
                              </div>
                              <div className="text-[10px] text-white/30 font-mono">
                                {m.gymId}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-amber-400 shrink-0">
                            ₱{m.balance.toLocaleString()} owed
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Member Loyalty — how long they've been members */}
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
                    Member Loyalty — Top by Duration
                  </div>
                  <div className="space-y-1.5">
                    {loyalMembers.slice(0, 8).map((m, i) => {
                      const months = getMemberDurationMonths(m.createdAt);
                      const pct = Math.min(100, (months / 36) * 100);
                      return (
                        <div key={m.gymId} className="flex items-center gap-3">
                          <span className="text-[10px] text-white/20 w-4 shrink-0 text-right">
                            {i + 1}
                          </span>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-6 h-6 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-[9px] font-bold text-[#FF6B1A] shrink-0">
                              {m.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs text-white truncate font-semibold">
                                  {m.name}
                                </span>
                                <span className="text-[10px] text-[#FF6B1A] font-semibold ml-2 shrink-0">
                                  {getMemberDuration(m.createdAt)}
                                </span>
                              </div>
                              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#FF6B1A] rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[m.status]}`}
                          >
                            {m.status.toUpperCase()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* New members (joined < 1 month) */}
                {newMembers.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
                      New Members ({formatDate(range.from)} —
                      {formatDate(range.to)})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {newMembers.map((m) => (
                        <div
                          key={m.gymId}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-400/5 border border-emerald-400/15 rounded-lg"
                        >
                          <span className="text-[10px] font-semibold text-white">
                            {m.name.split(" ")[0]}
                          </span>
                          <span className="text-[9px] text-white/25 font-mono">
                            {m.gymId}
                          </span>
                          <span className="text-[9px] text-emerald-400">
                            {m.plan}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* ══ 3. WALK-IN REPORT ══ */}
            <Section title="Walk-in Report" icon="🎫">
              <div className="space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatPill
                    label="Total Walk-ins"
                    value={walkInTotal}
                    color="text-[#FFB800]"
                  />
                  <StatPill
                    label="Revenue"
                    value={`₱${walkInRevenue.toLocaleString()}`}
                    color="text-[#FF6B1A]"
                  />
                  <StatPill
                    label="Regular"
                    value={regularCount}
                    color="text-[#FF6B1A]"
                  />
                  <StatPill
                    label="Student"
                    value={studentCount}
                    color="text-blue-400"
                  />
                </div>

                {/* Pass breakdown visual */}
                {walkInTotal > 0 && (
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3">
                      Pass Type Breakdown
                    </div>
                    <div className="space-y-2.5">
                      {[
                        {
                          label: "Regular",
                          count: regularCount,
                          price: 150,
                          color: "#FF6B1A",
                        },
                        {
                          label: "Student",
                          count: studentCount,
                          price: 100,
                          color: "#60a5fa",
                        },
                        {
                          label: "Couple",
                          count: coupleCount,
                          price: 250,
                          color: "#c084fc",
                        },
                      ].map(({ label, count, price, color }) => {
                        const pct =
                          walkInTotal > 0
                            ? Math.round((count / walkInTotal) * 100)
                            : 0;
                        return (
                          <div key={label}>
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className="text-xs font-semibold"
                                style={{ color }}
                              >
                                {label}
                              </span>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-white/30">
                                  {count} visits · ₱{price}/pass
                                </span>
                                <span
                                  className="font-mono font-bold"
                                  style={{ color }}
                                >
                                  ₱{(count * price).toLocaleString()}
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: color }}
                              />
                            </div>
                            <div className="text-[9px] text-white/20 mt-0.5">
                              {pct}% of total walk-ins
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {walkInTotal === 0 && (
                  <div className="text-center py-8 text-white/20 text-sm">
                    No walk-ins in this period
                  </div>
                )}
              </div>
            </Section>

            {/* ══ 4. STAFF PERFORMANCE ══ */}
            <Section title="Staff Performance" icon="👷">
              <div className="space-y-4">
                {staffStats.length === 0 ? (
                  <div className="text-center py-8 text-white/20 text-sm">
                    No staff activity in this period
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="grid grid-cols-4 gap-4 pb-2 border-b border-white/[0.07]">
                      {["Staff Member", "Payments", "Revenue", "Walk-ins"].map(
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

                    {/* Rows */}
                    {staffStats.map((s, i) => (
                      <div
                        key={s.name}
                        className="grid grid-cols-4 gap-4 py-2 border-b border-white/[0.04] last:border-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-[9px] font-bold text-[#FF6B1A] shrink-0">
                            {i + 1}
                          </div>
                          <span className="text-xs font-semibold text-white truncate">
                            {s.name}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-xs text-white/50">
                            {s.payments} txns
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-xs font-mono font-bold text-[#FFB800]">
                            ₱{s.amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-xs text-white/50">
                            {s.walkIns} registered
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Summary */}
                    <div className="grid grid-cols-4 gap-4 pt-2 border-t border-white/10 mt-1">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        Total
                      </span>
                      <span className="text-xs font-bold text-white">
                        {staffStats.reduce((s, x) => s + x.payments, 0)} txns
                      </span>
                      <span className="text-xs font-mono font-bold text-[#FF6B1A]">
                        ₱
                        {staffStats
                          .reduce((s, x) => s + x.amount, 0)
                          .toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-white">
                        {staffStats.reduce((s, x) => s + x.walkIns, 0)} walk-ins
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Section>

            {/* ── Report footer ── */}
            <div className="text-center py-4 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/20 tracking-widest uppercase">
                {gymName} · Report generated{" "}
                {new Date().toLocaleString("en-PH")} · Period:{" "}
                {formatDate(range.from)} — {formatDate(range.to)}
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
