/**
 * ReportsPage.tsx
 * Gym Management System — Owner Reports
 *
 * Fixes applied:
 *   - Race condition: fetchRevenue + fetchWalkIns now run together and merge
 *     staffStats in one place after both complete — walk-ins no longer show 0
 *   - settleBalance totalAmount fix reflected in reports
 *   - newMembersList computed once, not twice
 *   - Fetch limit raised to 1000 with truncation warning banner
 *   - Export uses computed values that are always up to date
 *   - Duplicate guard raised to 10s (controller fix)
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

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function getManilaDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    d,
  );
}

function getManilaDateFromDate(d: Date): string {
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

function buildDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(getManilaDateFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function dateLabel(dateStr: string, totalDays: number): string {
  const d = new Date(dateStr);
  if (totalDays <= 7)
    return d.toLocaleDateString("en-PH", { weekday: "short" });
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function estimateWalkInRevenue(
  walkInsByDate: Record<string, number>,
  walkInsByType: { regular: number; student: number; couple: number },
  totalWalkIns: number,
  filterDates: Set<string>,
): number {
  const filteredCount = Object.entries(walkInsByDate)
    .filter(([d]) => filterDates.has(d))
    .reduce((s, [, v]) => s + v, 0);
  if (totalWalkIns === 0) return 0;
  const avgPrice =
    (walkInsByType.regular * 150 +
      walkInsByType.student * 100 +
      walkInsByType.couple * 250) /
    totalWalkIns;
  return Math.round(filteredCount * avgPrice);
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  inactive: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  expired: "text-red-400 bg-red-400/10 border-red-400/20",
};

// ─── Date range ───────────────────────────────────────────────────────────────

type RangePreset = "today" | "week" | "month" | "custom";

function getRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const today = getManilaDate();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const mondayOffset = (new Date().getDay() + 6) % 7;
    return { from: getManilaDate(mondayOffset), to: today };
  }
  if (preset === "month") {
    const now = new Date();
    return {
      from: getManilaDateFromDate(
        new Date(now.getFullYear(), now.getMonth(), 1),
      ),
      to: today,
    };
  }
  return { from: customFrom || today, to: customTo || today };
}

// ─── Chart: Dual Bar ─────────────────────────────────────────────────────────

function DualBarChart({
  dates,
  revenueData,
  walkInData,
}: {
  dates: string[];
  revenueData: Record<string, number>;
  walkInData: Record<string, number>;
}) {
  const totalDays = dates.length;
  const step = Math.max(1, Math.ceil(totalDays / 28));
  const sampled = dates.filter(
    (_, i) => i % step === 0 || i === dates.length - 1,
  );
  const maxRev = Math.max(...sampled.map((d) => revenueData[d] ?? 0), 1);
  const maxWI = Math.max(...sampled.map((d) => walkInData[d] ?? 0), 1);
  const hasAnyData =
    sampled.some((d) => (revenueData[d] ?? 0) > 0) ||
    sampled.some((d) => (walkInData[d] ?? 0) > 0);

  if (!hasAnyData)
    return (
      <div className="flex items-center justify-center h-24 text-white/20 text-xs">
        No data for this period
      </div>
    );

  return (
    <div>
      <div className="flex gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#FF6B1A]" />
          <span className="text-[10px] text-white/40">Revenue (₱)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#FFB800]/70" />
          <span className="text-[10px] text-white/40">Walk-ins (count)</span>
        </div>
      </div>
      <div className="flex items-end gap-0.5 h-24">
        {sampled.map((d, i) => {
          const rev = revenueData[d] ?? 0;
          const wi = walkInData[d] ?? 0;
          const revH = Math.max(2, (rev / maxRev) * 88);
          const wiH = Math.max(2, (wi / maxWI) * 88);
          const lbl = dateLabel(d, totalDays);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-0.5 min-w-0 group relative"
            >
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-[#111] border border-white/15 rounded-lg px-2.5 py-1.5 text-[9px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                <div className="font-semibold text-white/60 mb-0.5">{lbl}</div>
                <div className="text-[#FF6B1A]">₱{rev.toLocaleString()}</div>
                <div className="text-[#FFB800]">
                  {wi} walk-in{wi !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="w-full flex items-end gap-px">
                <div
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${revH}px`,
                    background: "#FF6B1A",
                    opacity: rev === 0 ? 0.1 : 0.85,
                  }}
                />
                <div
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${wiH}px`,
                    background: "#FFB800",
                    opacity: wi === 0 ? 0.1 : 0.65,
                  }}
                />
              </div>
              {sampled.length <= 14 && (
                <span className="text-[7px] text-white/20 truncate w-full text-center leading-none">
                  {lbl}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {sampled.length > 14 && (
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] text-white/25">
            {dateLabel(sampled[0], totalDays)}
          </span>
          <span className="text-[9px] text-white/25">
            {dateLabel(sampled[Math.floor(sampled.length / 2)], totalDays)}
          </span>
          <span className="text-[9px] text-white/25">
            {dateLabel(sampled[sampled.length - 1], totalDays)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Chart: Revenue Source ────────────────────────────────────────────────────

function RevenueSourceChart({
  payments,
  walkInsByDate,
  walkInsByType,
  totalWalkIns,
}: {
  payments: Payment[];
  walkInsByDate: Record<string, number>;
  walkInsByType: { regular: number; student: number; couple: number };
  totalWalkIns: number;
}) {
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    const startStr = getManilaDateFromDate(weekStart);
    const endStr = getManilaDateFromDate(weekEnd);
    const label = `${formatShortDate(startStr)}–${new Date(endStr).getDate()}`;
    const memberRev = payments
      .filter((p) => {
        const d = p.createdAt?.split("T")[0] ?? "";
        return d >= startStr && d <= endStr;
      })
      .reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);
    const weekDates = new Set(buildDateRange(startStr, endStr));
    const wiRev = estimateWalkInRevenue(
      walkInsByDate,
      walkInsByType,
      totalWalkIns,
      weekDates,
    );
    return { label, memberRev, wiRev };
  }).reverse();

  const maxVal = Math.max(...weeks.flatMap((w) => [w.memberRev, w.wiRev]), 1);
  const hasData = weeks.some((w) => w.memberRev > 0 || w.wiRev > 0);

  if (!hasData)
    return (
      <div className="flex items-center justify-center h-20 text-white/20 text-xs">
        No data for last 6 weeks
      </div>
    );

  return (
    <div>
      <div className="flex gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#FF6B1A]" />
          <span className="text-[10px] text-white/40">Membership Revenue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#c084fc]/80" />
          <span className="text-[10px] text-white/40">
            Walk-in Revenue (est.)
          </span>
        </div>
      </div>
      <div className="flex items-end gap-2 h-20">
        {weeks.map((w, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative"
          >
            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-[#111] border border-white/15 rounded-lg px-2.5 py-1.5 text-[9px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
              <div className="font-semibold text-white/60 mb-0.5">
                {w.label}
              </div>
              <div className="text-[#FF6B1A]">
                ₱{w.memberRev.toLocaleString()} members
              </div>
              <div className="text-[#c084fc]">
                ₱{w.wiRev.toLocaleString()} walk-ins
              </div>
            </div>
            <div className="w-full flex items-end gap-px">
              <div
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${Math.max(2, (w.memberRev / maxVal) * 72)}px`,
                  background: "#FF6B1A",
                  opacity: w.memberRev === 0 ? 0.1 : 0.85,
                }}
              />
              <div
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${Math.max(2, (w.wiRev / maxVal) * 72)}px`,
                  background: "#c084fc",
                  opacity: w.wiRev === 0 ? 0.1 : 0.75,
                }}
              />
            </div>
            <span className="text-[7px] text-white/25 truncate w-full text-center">
              {w.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Chart: Member Growth ─────────────────────────────────────────────────────

function MemberGrowthChart({ members }: { members: Member[] }) {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleDateString("en-PH", {
      month: "short",
      year: "2-digit",
    });
    const count = members.filter((m) => {
      const c = new Date(m.createdAt);
      return c.getFullYear() === year && c.getMonth() === month;
    }).length;
    return { label, count };
  });

  const max = Math.max(...months.map((m) => m.count), 1);
  const total6months = months.reduce((s, m) => s + m.count, 0);

  if (!total6months)
    return (
      <div className="flex flex-col items-center justify-center h-24 text-center">
        <div className="text-2xl mb-1 opacity-20">📈</div>
        <div className="text-white/20 text-xs">
          No new members in the last 6 months
        </div>
      </div>
    );

  return (
    <div>
      <div className="flex items-end gap-2 h-24">
        {months.map((m, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative"
          >
            {m.count > 0 && (
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-[#111] border border-white/15 rounded-lg px-2 py-1 text-[9px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                {m.count} new member{m.count !== 1 ? "s" : ""} · {m.label}
              </div>
            )}
            {m.count > 0 && (
              <span className="text-[9px] font-bold text-emerald-400 leading-none">
                {m.count}
              </span>
            )}
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${Math.max(3, (m.count / max) * 72)}px`,
                background: "#22c55e",
                opacity: m.count === 0 ? 0.1 : 0.75,
              }}
            />
            <span className="text-[7px] text-white/30 truncate w-full text-center">
              {m.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-white/25">
          {total6months} new in last 6 months
        </span>
        <span className="text-[10px] text-white/25">
          Total: {members.length} members
        </span>
      </div>
    </div>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
  loading = false,
  error = "",
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: string;
}) {
  return (
    <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 bg-white/[0.02] flex items-center gap-2.5">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {loading && (
          <span className="ml-auto w-3.5 h-3.5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
        )}
      </div>
      <div className="p-5">
        {error ? (
          <div className="flex items-center gap-2.5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <span className="text-red-400 text-sm">⚠</span>
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-8 bg-white/[0.04] rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color = "text-white",
  borderColor = "border-t-white/20",
  bg = "bg-white/[0.03]",
}: {
  label: string;
  value: string | number;
  color?: string;
  borderColor?: string;
  bg?: string;
}) {
  return (
    <div
      className={`${bg} border border-white/[0.07] border-t-2 ${borderColor} rounded-xl p-4 text-center`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-1.5">
        {label}
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

function ChartDivider() {
  return <div className="border-t border-white/[0.06]" />;
}
function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold">
      {children}
    </div>
  );
}
function StatPillSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 h-20 animate-pulse"
        />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// Raise limit to 1000 — show warning if truncated
const FETCH_LIMIT = 1000;

export default function ReportsPage() {
  const { settings, getWalkInPrice } = useGymStore();
  const gymName = settings?.gymName || "Gym Management System";
  const wiRegular = getWalkInPrice("regular");
  const wiStudent = getWalkInPrice("student");
  const wiCouple = getWalkInPrice("couple");

  const [preset, setPreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState(getManilaDate(30));
  const [customTo, setCustomTo] = useState(getManilaDate());

  const [revenueLoading, setRevenueLoading] = useState(true);
  const [memberLoading, setMemberLoading] = useState(true);
  const [walkInLoading, setWalkInLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [revenueError, setRevenueError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [walkInError, setWalkInError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Truncation warning — shown if any fetch hits the limit
  const [dataTruncated, setDataTruncated] = useState(false);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [cashRevenue, setCashRevenue] = useState(0);
  const [onlineRevenue, setOnlineRevenue] = useState(0);
  const [revenueByDate, setRevenueByDate] = useState<Record<string, number>>(
    {},
  );

  const [walkInTotal, setWalkInTotal] = useState(0);
  const [walkInRevenue, setWalkInRevenue] = useState(0);
  const [regularCount, setRegularCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [coupleCount, setCoupleCount] = useState(0);
  const [walkInsByDate, setWalkInsByDate] = useState<Record<string, number>>(
    {},
  );

  const [members, setMembers] = useState<Member[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [newInRange, setNewInRange] = useState(0);

  // FIX: staffStats built from BOTH payments and walk-ins together
  // instead of separately to avoid the race condition
  const [staffStats, setStaffStats] = useState<
    { name: string; payments: number; amount: number; walkIns: number }[]
  >([]);

  const range = getRange(preset, customFrom, customTo);
  const rangeDates = buildDateRange(range.from, range.to);

  // ── FIX: Single coordinated fetch for revenue + walk-ins + staffStats ────────
  // Both datasets are needed to build staffStats correctly.
  // Running them together with Promise.all and merging after prevents the race.
  const fetchRevenueAndWalkIns = useCallback(async () => {
    setRevenueLoading(true);
    setWalkInLoading(true);
    setStaffLoading(true);
    setRevenueError("");
    setWalkInError("");
    setDataTruncated(false);

    try {
      const [payRes, wiRes] = await Promise.all([
        paymentService.getAll({
          from: range.from,
          to: range.to,
          limit: FETCH_LIMIT,
          page: 1,
        }),
        walkInService.getHistory({
          from: range.from,
          to: range.to,
          limit: FETCH_LIMIT,
          page: 1,
        }),
      ]);

      // Check for truncation
      if (payRes.total > FETCH_LIMIT || (wiRes.total ?? 0) > FETCH_LIMIT) {
        setDataTruncated(true);
      }

      // ── Payments ──
      const all = payRes.payments;
      setPayments(all);
      const total = all.reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);
      const cash = all
        .filter((p) => p.method === "cash")
        .reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);
      setTotalRevenue(total);
      setCashRevenue(cash);
      setOnlineRevenue(total - cash);
      const revMap: Record<string, number> = {};
      all.forEach((p) => {
        const d = p.createdAt?.split("T")[0] ?? "";
        revMap[d] = (revMap[d] ?? 0) + (p.amountPaid ?? p.amount);
      });
      setRevenueByDate(revMap);

      // ── Walk-ins ──
      setWalkInTotal(wiRes.summary?.total ?? 0);
      setWalkInRevenue(wiRes.summary?.revenue ?? 0);
      setRegularCount(wiRes.summary?.regular ?? 0);
      setStudentCount(wiRes.summary?.student ?? 0);
      setCoupleCount(wiRes.summary?.couple ?? 0);
      const wiMap: Record<string, number> = {};
      wiRes.walkIns?.forEach((w) => {
        const d = w.checkIn?.split("T")[0] ?? "";
        wiMap[d] = (wiMap[d] ?? 0) + 1;
      });
      setWalkInsByDate(wiMap);

      // ── Staff stats — built from BOTH sources at the same time ──
      const staffMap: Record<
        string,
        { name: string; payments: number; amount: number; walkIns: number }
      > = {};

      // From payments
      all.forEach((p) => {
        const name = p.processedBy?.name ?? "Unknown";
        if (!staffMap[name])
          staffMap[name] = { name, payments: 0, amount: 0, walkIns: 0 };
        staffMap[name].payments += 1;
        staffMap[name].amount += p.amountPaid ?? p.amount;
      });

      // From walk-ins — merged into same map
      wiRes.walkIns?.forEach((w) => {
        const name = w.staffId?.name ?? "Unknown";
        if (!staffMap[name])
          staffMap[name] = { name, payments: 0, amount: 0, walkIns: 0 };
        staffMap[name].walkIns += 1;
      });

      setStaffStats(
        Object.values(staffMap).sort((a, b) => b.amount - a.amount),
      );
    } catch {
      setRevenueError("Failed to load revenue data. Please try again.");
      setWalkInError("Failed to load walk-in data. Please try again.");
    } finally {
      setRevenueLoading(false);
      setWalkInLoading(false);
      setStaffLoading(false);
    }
  }, [range.from, range.to]);

  const fetchMembers = useCallback(async () => {
    setMemberLoading(true);
    setMemberError("");
    try {
      const [activeRes, inactiveRes, expiredRes, allRes] = await Promise.all([
        memberService.getAll({ status: "active", limit: FETCH_LIMIT }),
        memberService.getAll({ status: "inactive", limit: FETCH_LIMIT }),
        memberService.getAll({ status: "expired", limit: FETCH_LIMIT }),
        memberService.getAll({ limit: FETCH_LIMIT }),
      ]);
      const allMembers = allRes.members;
      setMembers(allMembers);
      setActiveCount(activeRes.total);
      setInactiveCount(inactiveRes.total);
      setExpiredCount(expiredRes.total);
      const rFrom = new Date(range.from);
      const rTo = new Date(range.to);
      rTo.setHours(23, 59, 59, 999);
      setNewInRange(
        allMembers.filter((m) => {
          const c = new Date(m.createdAt);
          return c >= rFrom && c <= rTo;
        }).length,
      );
    } catch {
      setMemberError("Failed to load member data. Please try again.");
    } finally {
      setMemberLoading(false);
    }
  }, [range.from, range.to]);

  const fetchAllRef = useRef({ fetchRevenueAndWalkIns, fetchMembers });
  useEffect(() => {
    fetchAllRef.current = { fetchRevenueAndWalkIns, fetchMembers };
  }, [fetchRevenueAndWalkIns, fetchMembers]);

  useEffect(() => {
    fetchAllRef.current.fetchRevenueAndWalkIns();
    fetchAllRef.current.fetchMembers();
  }, [range.from, range.to]);

  // ── Computed — single source of truth ───────────────────────────────────────
  const totalMembers = activeCount + inactiveCount + expiredCount;
  const combinedRevenue = totalRevenue + walkInRevenue;
  const loyalMembers = members
    .filter((m) => getMemberDurationMonths(m.createdAt) >= 3)
    .sort(
      (a, b) =>
        getMemberDurationMonths(b.createdAt) -
        getMemberDurationMonths(a.createdAt),
    );
  const membersWithBalance = members.filter((m) => m.balance > 0);
  const cashPct =
    totalRevenue > 0 ? Math.round((cashRevenue / totalRevenue) * 100) : 0;
  const rFrom2 = new Date(range.from);
  const rTo2 = new Date(range.to);
  rTo2.setHours(23, 59, 59, 999);
  // FIX: computed once, used everywhere (export + render)
  const newMembersList = members.filter((m) => {
    const c = new Date(m.createdAt);
    return c >= rFrom2 && c <= rTo2;
  });
  const walkInsByType = {
    regular: regularCount,
    student: studentCount,
    couple: coupleCount,
  };
  const anyLoading =
    revenueLoading || walkInLoading || memberLoading || staffLoading;

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      const onlinePct = 100 - cashPct;

      const revDates = rangeDates.slice(-14);
      const maxRev = Math.max(...revDates.map((d) => revenueByDate[d] ?? 0), 1);
      const revBars = revDates
        .map((d, i) => {
          const val = revenueByDate[d] ?? 0;
          const h = Math.max(2, (val / maxRev) * 80);
          const x = i * (560 / revDates.length) + 4;
          const w = 560 / revDates.length - 3;
          return `<rect x="${x}" y="${90 - h}" width="${w}" height="${h}" fill="${val === 0 ? "#eee" : "#FF6B1A"}" rx="2"/>`;
        })
        .join("");
      const revLabels = revDates
        .filter((_, i) => i % 2 === 0)
        .map((d, i) => {
          const x =
            i * 2 * (560 / revDates.length) + 4 + 560 / revDates.length / 2;
          const lbl = new Date(d).toLocaleDateString("en-PH", {
            month: "short",
            day: "numeric",
          });
          return `<text x="${x}" y="105" text-anchor="middle" font-size="8" fill="#999">${lbl}</text>`;
        })
        .join("");

      const growthMonths = Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        const count = members.filter((m) => {
          const c = new Date(m.createdAt);
          return (
            c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth()
          );
        }).length;
        return {
          label: d.toLocaleDateString("en-PH", { month: "short" }),
          count,
        };
      });
      const maxGrowth = Math.max(...growthMonths.map((m) => m.count), 1);
      const growthBars = growthMonths
        .map((m, i) => {
          const h = Math.max(2, (m.count / maxGrowth) * 70);
          const x = i * 90 + 10;
          return `
          <rect x="${x}" y="${80 - h}" width="70" height="${h}" fill="${m.count === 0 ? "#eee" : "#22c55e"}" rx="2"/>
          ${m.count > 0 ? `<text x="${x + 35}" y="${80 - h - 3}" text-anchor="middle" font-size="9" fill="#22c55e" font-weight="bold">${m.count}</text>` : ""}
          <text x="${x + 35}" y="94" text-anchor="middle" font-size="8" fill="#999">${m.label}</text>`;
        })
        .join("");

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${gymName} — Report</title>
  <style>
    @page { margin: 18mm 16mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; background: white; }
    h1 { font-size: 20px; font-weight: 800; color: #111; }
    h2 { font-size: 13px; font-weight: 700; color: #111; border-bottom: 2px solid #FF6B1A; padding-bottom: 6px; margin-bottom: 14px; }
    h3 { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
    .header { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
    .meta { font-size: 10px; color: #888; margin-top: 4px; }
    .hero { background: #fff5f0; border: 1px solid #ffd0b8; border-left: 4px solid #FF6B1A; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
    .hero-value { font-size: 28px; font-weight: 800; color: #FF6B1A; font-variant-numeric: tabular-nums; }
    .hero-sub { font-size: 10px; color: #888; margin-top: 4px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .section { background: #fff; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; page-break-inside: avoid; }
    .pill { background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px; text-align: center; }
    .pill-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.07em; color: #aaa; font-weight: 600; margin-bottom: 4px; }
    .pill-value { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .pill.orange { border-top: 3px solid #FF6B1A; } .pill.gold { border-top: 3px solid #FFB800; }
    .pill.blue { border-top: 3px solid #60a5fa; } .pill.green { border-top: 3px solid #22c55e; }
    .pill.red { border-top: 3px solid #f87171; } .pill.purple { border-top: 3px solid #c084fc; } .pill.gray { border-top: 3px solid #ccc; }
    .bar-track { background: #f0f0f0; border-radius: 100px; height: 6px; overflow: hidden; margin: 3px 0 6px; }
    .bar-fill { height: 100%; border-radius: 100px; }
    .split-track { background: #f0f0f0; border-radius: 100px; height: 8px; overflow: hidden; display: flex; margin: 4px 0 6px; }
    .row { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0f0f0; font-size: 10px; }
    .row:last-child { border-bottom: none; }
    .row-label { color: #555; } .row-val { font-weight: 700; font-variant-numeric: tabular-nums; }
    .badge { display: inline-block; font-size: 8px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 100px; border: 1px solid; }
    .badge-active { color: #16a34a; border-color: #bbf7d0; background: #f0fdf4; }
    .badge-inactive { color: #d97706; border-color: #fde68a; background: #fffbeb; }
    .badge-expired { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
    .loyalty-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    .loyalty-avatar { width: 22px; height: 22px; border-radius: 50%; background: #fff0e8; color: #FF6B1A; font-size: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 1px solid #ffd0b8; flex-shrink: 0; }
    .loyalty-name { flex: 1; font-size: 10px; font-weight: 600; color: #111; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .loyalty-dur { font-size: 9px; color: #FF6B1A; font-weight: 700; white-space: nowrap; }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid #d1fae5; background: #f0fdf4; border-radius: 6px; font-size: 9px; margin: 2px; }
    .chip-name { font-weight: 600; color: #111; } .chip-id { color: #aaa; font-family: monospace; }
    .chip-plan { color: #16a34a; font-weight: 600; }
    .staff-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #f5f5f5; font-size: 10px; }
    .staff-row:last-child { border-bottom: none; }
    .staff-total { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; padding: 8px 0 0; border-top: 2px solid #eee; font-size: 10px; font-weight: 700; }
    .tbl-head { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 8px; padding: 0 0 6px; border-bottom: 1px solid #e5e5e5; font-size: 8px; text-transform: uppercase; letter-spacing: 0.07em; color: #aaa; font-weight: 600; }
    .divider { border: none; border-top: 1px solid #f0f0f0; margin: 12px 0; }
    .footer { text-align: center; font-size: 9px; color: #bbb; margin-top: 20px; text-transform: uppercase; letter-spacing: 0.05em; border-top: 1px solid #eee; padding-top: 10px; }
    svg { display: block; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${gymName} — Business Report</h1>
    <div class="meta">Period: ${formatDate(range.from)} — ${formatDate(range.to)} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString("en-PH")}</div>
  </div>
  <div class="hero">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#FF6B1A;font-weight:700;margin-bottom:4px;">Total Combined Revenue</div>
    <div class="hero-value">₱${combinedRevenue.toLocaleString()}</div>
    <div class="hero-sub">Membership: ₱${totalRevenue.toLocaleString()} &nbsp;·&nbsp; Walk-ins: ₱${walkInRevenue.toLocaleString()} &nbsp;·&nbsp; Cash: ₱${cashRevenue.toLocaleString()} &nbsp;·&nbsp; Online: ₱${onlineRevenue.toLocaleString()}</div>
  </div>
  <div class="grid2">
    <div class="section">
      <h2>💰 Revenue Report</h2>
      <div class="grid2" style="margin-bottom:12px;">
        <div class="pill orange"><div class="pill-label">Membership Rev</div><div class="pill-value" style="color:#FF6B1A;">₱${totalRevenue.toLocaleString()}</div></div>
        <div class="pill purple"><div class="pill-label">Walk-in Rev</div><div class="pill-value" style="color:#c084fc;">₱${walkInRevenue.toLocaleString()}</div></div>
        <div class="pill gold"><div class="pill-label">Cash</div><div class="pill-value" style="color:#FFB800;">₱${cashRevenue.toLocaleString()}</div></div>
        <div class="pill blue"><div class="pill-label">Online</div><div class="pill-value" style="color:#60a5fa;">₱${onlineRevenue.toLocaleString()}</div></div>
      </div>
      ${
        totalRevenue > 0
          ? `
      <h3>Cash vs Online Split</h3>
      <div class="split-track"><div class="bar-fill" style="width:${cashPct}%;background:#FFB800;"></div><div class="bar-fill" style="flex:1;background:#60a5fa;"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:12px;">
        <span style="color:#FFB800;font-weight:700;">${cashPct}% Cash</span>
        <span style="color:#60a5fa;font-weight:700;">${onlinePct}% Online</span>
      </div>`
          : ""
      }
      <h3>Revenue Trend — Last ${Math.min(14, rangeDates.length)} Days</h3>
      <svg viewBox="0 0 568 110" width="100%" style="margin-bottom:12px;">${revBars}${revLabels}</svg>
      <hr class="divider"/>
      <h3>By Payment Type</h3>
      ${(["new_member", "renewal", "manual", "balance_settlement"] as const)
        .map((type) => {
          const labels: Record<string, string> = {
            new_member: "New Member",
            renewal: "Renewal",
            manual: "Manual",
            balance_settlement: "Settlement",
          };
          const tp = payments.filter((p) => p.type === type);
          const tt = tp.reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);
          if (tp.length === 0) return "";
          const pct =
            totalRevenue > 0 ? Math.round((tt / totalRevenue) * 100) : 0;
          return `<div class="row"><span class="row-label">${labels[type]}</span><div style="display:flex;align-items:center;gap:12px;"><span style="color:#aaa;font-size:9px;">${tp.length} payments · ${pct}%</span><span class="row-val" style="color:#FFB800;">₱${tt.toLocaleString()}</span></div></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#FF6B1A;"></div></div>`;
        })
        .join("")}
    </div>
    <div class="section">
      <h2>👥 Member Report</h2>
      <div class="grid2" style="margin-bottom:12px;">
        <div class="pill gray"><div class="pill-label">Total Members</div><div class="pill-value">${totalMembers}</div></div>
        <div class="pill blue"><div class="pill-label">New in Period</div><div class="pill-value" style="color:#60a5fa;">${newInRange}</div></div>
        <div class="pill green"><div class="pill-label">Active</div><div class="pill-value" style="color:#22c55e;">${activeCount}</div></div>
        <div class="pill red"><div class="pill-label">Inactive / Expired</div><div class="pill-value" style="color:#f87171;">${inactiveCount} / ${expiredCount}</div></div>
      </div>
      <h3>Member Growth — Last 6 Months</h3>
      <svg viewBox="0 0 560 100" width="100%" style="margin-bottom:12px;">${growthBars}</svg>
      ${
        membersWithBalance.length > 0
          ? `
      <hr class="divider"/>
      <h3>Outstanding Balances (${membersWithBalance.length})</h3>
      ${membersWithBalance
        .slice(0, 5)
        .map(
          (m) =>
            `<div class="row"><span class="row-label">${m.name} <span style="color:#aaa;font-size:9px;font-family:monospace;">${m.gymId}</span></span><span class="row-val" style="color:#d97706;">₱${m.balance.toLocaleString()} owed</span></div>`,
        )
        .join("")}`
          : ""
      }
      <hr class="divider"/>
      <h3>Member Loyalty — Top by Duration</h3>
      ${loyalMembers
        .slice(0, 8)
        .map((m, i) => {
          const months2 = getMemberDurationMonths(m.createdAt);
          const pct2 = Math.min(100, (months2 / 36) * 100);
          const initials = m.name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return `<div class="loyalty-row"><span style="color:#ccc;font-size:9px;width:14px;text-align:right;">${i + 1}</span><div class="loyalty-avatar">${initials}</div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;"><span class="loyalty-name">${m.name}</span><span class="loyalty-dur">${getMemberDuration(m.createdAt)}</span></div><div class="bar-track" style="margin:0;"><div class="bar-fill" style="width:${pct2}%;background:#FF6B1A;"></div></div></div><span class="badge ${m.status === "active" ? "badge-active" : m.status === "inactive" ? "badge-inactive" : "badge-expired"}">${m.status.toUpperCase()}</span></div>`;
        })
        .join("")}
      ${
        newMembersList.length > 0
          ? `
      <hr class="divider"/>
      <h3>New Members in Period</h3>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${newMembersList.map((m) => `<div class="chip"><span class="chip-name">${m.name.split(" ")[0]}</span><span class="chip-id">${m.gymId}</span><span class="chip-plan">${m.plan}</span></div>`).join("")}
      </div>`
          : ""
      }
    </div>
  </div>
  <div class="grid2">
    <div class="section">
      <h2>🎫 Walk-in Report</h2>
      <div class="grid2" style="margin-bottom:12px;">
        <div class="pill gold"><div class="pill-label">Total Walk-ins</div><div class="pill-value" style="color:#FFB800;">${walkInTotal}</div></div>
        <div class="pill purple"><div class="pill-label">Revenue</div><div class="pill-value" style="color:#c084fc;">₱${walkInRevenue.toLocaleString()}</div></div>
        <div class="pill orange"><div class="pill-label">Regular</div><div class="pill-value" style="color:#FF6B1A;">${regularCount}</div></div>
        <div class="pill blue"><div class="pill-label">Student</div><div class="pill-value" style="color:#60a5fa;">${studentCount}</div></div>
      </div>
    </div>
    <div class="section">
      <h2>👷 Staff Performance</h2>
      ${
        staffStats.length === 0
          ? `<div style="text-align:center;padding:20px;color:#bbb;font-size:11px;">No staff activity in this period</div>`
          : `
      <div class="tbl-head"><span>Staff Member</span><span>Payments</span><span>Revenue</span><span>Walk-ins</span></div>
      ${staffStats
        .map((s, i) => {
          const topAmt = staffStats[0]?.amount ?? 1;
          const barPct4 = Math.round((s.amount / topAmt) * 100);
          return `<div class="staff-row"><div style="display:flex;align-items:center;gap:6px;"><div style="width:18px;height:18px;border-radius:50%;background:#fff0e8;border:1px solid #ffd0b8;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#FF6B1A;flex-shrink:0;">${i + 1}</div><span style="font-weight:600;color:#111;">${s.name}</span></div><span style="color:#555;">${s.payments}</span><span style="color:#FFB800;font-weight:700;font-variant-numeric:tabular-nums;">₱${s.amount.toLocaleString()}</span><span style="color:#555;">${s.walkIns}</span></div><div style="padding-left:24px;margin-bottom:4px;"><div class="bar-track" style="margin:0;"><div class="bar-fill" style="width:${barPct4}%;background:#FF6B1A;"></div></div></div>`;
        })
        .join("")}
      <div class="staff-total"><span style="color:#888;text-transform:uppercase;letter-spacing:0.05em;font-size:9px;">Total</span><span>${staffStats.reduce((s, x) => s + x.payments, 0)} payments</span><span style="color:#FF6B1A;">₱${staffStats.reduce((s, x) => s + x.amount, 0).toLocaleString()}</span><span>${staffStats.reduce((s, x) => s + x.walkIns, 0)} walk-ins</span></div>`
      }
    </div>
  </div>
  <div class="footer">${gymName} &nbsp;·&nbsp; ${formatDate(range.from)} — ${formatDate(range.to)} &nbsp;·&nbsp; Generated ${new Date().toLocaleString("en-PH")}</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
      }
      setExporting(false);
    }, 300);
  };

  return (
    <>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div
        className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-5"
        style={{ animation: "fadeIn 0.2s ease" }}
      >
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Reports</h2>
            <p className="text-xs text-white/30 mt-0.5">
              Business insights for{" "}
              <span className="text-white/50 font-semibold">{gymName}</span>
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={anyLoading || exporting}
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

        {/* ── Truncation warning ── */}
        {dataTruncated && (
          <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-400/10 border border-amber-400/20 rounded-xl">
            <span className="text-amber-400 text-sm shrink-0">⚠</span>
            <p className="text-amber-400 text-xs">
              This period has more than {FETCH_LIMIT.toLocaleString()} records.
              Report data may be incomplete. Consider using a shorter date range
              for accuracy.
            </p>
          </div>
        )}

        {/* ── Date Range Filter ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4">
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
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${preset === key ? "bg-[#FF6B1A]/15 text-[#FF6B1A] border-[#FF6B1A]/30" : "bg-[#2a2a2a] text-white/40 border-white/10 hover:text-white hover:border-white/20"}`}
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
              {formatDate(range.from)} → {formatDate(range.to)} ·{" "}
              {rangeDates.length}d
            </div>
          </div>
        </div>

        {/* ── Combined Revenue Hero ── */}
        <div className="bg-[#FF6B1A]/5 border border-white/10 border-t-2 border-t-[#FF6B1A] rounded-xl p-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-1">
            Total Combined Revenue
          </div>
          {revenueLoading || walkInLoading ? (
            <div className="h-10 w-48 bg-white/5 rounded animate-pulse" />
          ) : (
            <>
              <div className="text-4xl font-bold text-[#FF6B1A] font-mono">
                ₱{combinedRevenue.toLocaleString()}
              </div>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-[11px] text-white/30">
                  Memberships:{" "}
                  <span className="text-white/60 font-semibold">
                    ₱{totalRevenue.toLocaleString()}
                  </span>
                </span>
                <span className="text-white/10">·</span>
                <span className="text-[11px] text-white/30">
                  Walk-ins:{" "}
                  <span className="text-white/60 font-semibold">
                    ₱{walkInRevenue.toLocaleString()}
                  </span>
                </span>
                <span className="text-white/10">·</span>
                <span className="text-[11px] text-white/30">
                  Period:{" "}
                  <span className="text-white/60 font-semibold">
                    {formatDate(range.from)} — {formatDate(range.to)}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── Revenue + Member ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Section
            title="Revenue Report"
            icon="💰"
            loading={revenueLoading}
            error={revenueError}
          >
            <div className="space-y-5">
              {revenueLoading ? (
                <StatPillSkeleton count={4} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <StatPill
                    label="Membership Revenue"
                    value={`₱${totalRevenue.toLocaleString()}`}
                    color="text-[#FF6B1A]"
                    borderColor="border-t-[#FF6B1A]"
                    bg="bg-[#FF6B1A]/5"
                  />
                  <StatPill
                    label="Walk-in Revenue"
                    value={`₱${walkInRevenue.toLocaleString()}`}
                    color="text-purple-400"
                    borderColor="border-t-purple-400"
                    bg="bg-purple-400/5"
                  />
                  <StatPill
                    label="Cash"
                    value={`₱${cashRevenue.toLocaleString()}`}
                    color="text-[#FFB800]"
                    borderColor="border-t-[#FFB800]"
                    bg="bg-[#FFB800]/5"
                  />
                  <StatPill
                    label="Online"
                    value={`₱${onlineRevenue.toLocaleString()}`}
                    color="text-blue-400"
                    borderColor="border-t-blue-400"
                    bg="bg-blue-400/5"
                  />
                </div>
              )}
              <ChartDivider />
              {!revenueLoading && totalRevenue > 0 && (
                <>
                  <div>
                    <ChartLabel>Cash vs Online Split</ChartLabel>
                    <div className="h-2.5 rounded-full overflow-hidden bg-white/[0.06] flex gap-px">
                      <div
                        className="bg-[#FFB800] rounded-full transition-all"
                        style={{ width: `${cashPct}%` }}
                      />
                      <div className="bg-blue-400 rounded-full flex-1 transition-all" />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px]">
                      <span className="text-[#FFB800] font-semibold">
                        {cashPct}% Cash — ₱{cashRevenue.toLocaleString()}
                      </span>
                      <span className="text-blue-400 font-semibold">
                        {100 - cashPct}% Online — ₱
                        {onlineRevenue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <ChartDivider />
                </>
              )}
              <div>
                <ChartLabel>
                  Revenue & Walk-in Trend — {rangeDates.length} day
                  {rangeDates.length !== 1 ? "s" : ""}
                </ChartLabel>
                <DualBarChart
                  dates={rangeDates}
                  revenueData={revenueByDate}
                  walkInData={walkInsByDate}
                />
              </div>
              <ChartDivider />
              <div>
                <ChartLabel>Revenue Source — Last 6 Weeks</ChartLabel>
                <RevenueSourceChart
                  payments={payments}
                  walkInsByDate={walkInsByDate}
                  walkInsByType={walkInsByType}
                  totalWalkIns={walkInTotal}
                />
              </div>
              <ChartDivider />
              {!revenueLoading && (
                <div>
                  <ChartLabel>By Payment Type</ChartLabel>
                  {payments.length === 0 ? (
                    <div className="text-center py-4 text-white/20 text-xs">
                      No payments in this period
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {(
                        [
                          "new_member",
                          "renewal",
                          "manual",
                          "balance_settlement",
                        ] as const
                      ).map((type) => {
                        const labels: Record<string, string> = {
                          new_member: "New Member",
                          renewal: "Renewal",
                          manual: "Manual",
                          balance_settlement: "Settlement",
                        };
                        const tp = payments.filter((p) => p.type === type);
                        const tt = tp.reduce(
                          (s, p) => s + (p.amountPaid ?? p.amount),
                          0,
                        );
                        if (tp.length === 0) return null;
                        const pct =
                          totalRevenue > 0
                            ? Math.round((tt / totalRevenue) * 100)
                            : 0;
                        return (
                          <div key={type}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-white/60">
                                {labels[type]}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] text-white/25">
                                  {tp.length} payment
                                  {tp.length !== 1 ? "s" : ""} · {pct}%
                                </span>
                                <span className="text-xs font-mono font-semibold text-[#FFB800]">
                                  ₱{tt.toLocaleString()}
                                </span>
                              </div>
                            </div>
                            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#FF6B1A] rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Member Report"
            icon="👥"
            loading={memberLoading}
            error={memberError}
          >
            <div className="space-y-5">
              {memberLoading ? (
                <StatPillSkeleton count={4} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <StatPill
                    label="Total Members"
                    value={totalMembers}
                    color="text-white"
                    borderColor="border-t-white/20"
                  />
                  <StatPill
                    label="New in Period"
                    value={newInRange}
                    color="text-blue-400"
                    borderColor="border-t-blue-400"
                    bg="bg-blue-400/5"
                  />
                  <StatPill
                    label="Active"
                    value={activeCount}
                    color="text-emerald-400"
                    borderColor="border-t-emerald-400"
                    bg="bg-emerald-400/5"
                  />
                  <StatPill
                    label="Inactive / Expired"
                    value={`${inactiveCount} / ${expiredCount}`}
                    color="text-red-400"
                    borderColor="border-t-red-400"
                    bg="bg-red-400/5"
                  />
                </div>
              )}
              <ChartDivider />
              {!memberLoading && (
                <>
                  <div>
                    <ChartLabel>Member Growth — Last 6 Months</ChartLabel>
                    <MemberGrowthChart members={members} />
                  </div>
                  <ChartDivider />
                </>
              )}
              {!memberLoading && membersWithBalance.length > 0 && (
                <>
                  <div>
                    <ChartLabel>
                      Outstanding Balances — {membersWithBalance.length} member
                      {membersWithBalance.length !== 1 ? "s" : ""}
                    </ChartLabel>
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
                                {m.gymId} · {m.plan}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-amber-400 shrink-0">
                            ₱{m.balance.toLocaleString()} owed
                          </span>
                        </div>
                      ))}
                      {membersWithBalance.length > 5 && (
                        <div className="text-[10px] text-white/20 text-center pt-1">
                          +{membersWithBalance.length - 5} more with outstanding
                          balance
                        </div>
                      )}
                    </div>
                  </div>
                  <ChartDivider />
                </>
              )}
              {!memberLoading && (
                <div>
                  <ChartLabel>Member Loyalty — Longest Active</ChartLabel>
                  <div className="space-y-2">
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
                    {loyalMembers.length === 0 && (
                      <div className="text-center py-4 text-white/20 text-xs">
                        No members with 3+ months yet
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!memberLoading && newMembersList.length > 0 && (
                <>
                  <ChartDivider />
                  <div>
                    <ChartLabel>
                      New Members — {formatDate(range.from)} to{" "}
                      {formatDate(range.to)}
                    </ChartLabel>
                    <div className="flex flex-wrap gap-2">
                      {newMembersList.map((m) => (
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
                          <span className="text-[9px] text-white/20">
                            {formatDate(m.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Section>
        </div>

        {/* ── Walk-in + Staff ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Section
            title="Walk-in Report"
            icon="🎫"
            loading={walkInLoading}
            error={walkInError}
          >
            <div className="space-y-5">
              {walkInLoading ? (
                <StatPillSkeleton count={4} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <StatPill
                    label="Total Walk-ins"
                    value={walkInTotal}
                    color="text-[#FFB800]"
                    borderColor="border-t-[#FFB800]"
                    bg="bg-[#FFB800]/5"
                  />
                  <StatPill
                    label="Walk-in Revenue"
                    value={`₱${walkInRevenue.toLocaleString()}`}
                    color="text-purple-400"
                    borderColor="border-t-purple-400"
                    bg="bg-purple-400/5"
                  />
                  <StatPill
                    label="Regular Passes"
                    value={regularCount}
                    color="text-[#FF6B1A]"
                    borderColor="border-t-[#FF6B1A]"
                    bg="bg-[#FF6B1A]/5"
                  />
                  <StatPill
                    label="Student Passes"
                    value={studentCount}
                    color="text-blue-400"
                    borderColor="border-t-blue-400"
                    bg="bg-blue-400/5"
                  />
                </div>
              )}
              {!walkInLoading && (
                <>
                  <ChartDivider />
                  {walkInTotal > 0 ? (
                    <div>
                      <ChartLabel>Pass Type Breakdown</ChartLabel>
                      <div className="space-y-3">
                        {[
                          {
                            label: "Regular",
                            count: regularCount,
                            price: wiRegular,
                            color: "#FF6B1A",
                          },
                          {
                            label: "Student",
                            count: studentCount,
                            price: wiStudent,
                            color: "#60a5fa",
                          },
                          {
                            label: "Couple",
                            count: coupleCount,
                            price: wiCouple,
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
                                    {count} visit{count !== 1 ? "s" : ""} · ₱
                                    {price}/pass
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
                                  style={{
                                    width: `${pct}%`,
                                    background: color,
                                  }}
                                />
                              </div>
                              <div className="text-[9px] text-white/20 mt-0.5">
                                {pct}% of total
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="text-3xl mb-2 opacity-20">🎫</div>
                      <div className="text-white/25 text-sm font-semibold">
                        No walk-ins this period
                      </div>
                      <div className="text-white/15 text-xs mt-1">
                        Try a wider date range
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Staff Performance" icon="👷" loading={staffLoading}>
            <div className="space-y-4">
              {!staffLoading && staffStats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="text-3xl mb-2 opacity-20">👷</div>
                  <div className="text-white/25 text-sm font-semibold">
                    No staff activity
                  </div>
                  <div className="text-white/15 text-xs mt-1">
                    No payments processed in this period
                  </div>
                </div>
              )}
              {!staffLoading && staffStats.length > 0 && (
                <>
                  <div className="grid grid-cols-4 gap-3 pb-2 border-b border-white/[0.07]">
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
                  {staffStats.map((s, i) => {
                    const topAmount = staffStats[0]?.amount ?? 1;
                    const barPct = Math.round((s.amount / topAmount) * 100);
                    return (
                      <div key={s.name} className="space-y-1.5">
                        <div className="grid grid-cols-4 gap-3 items-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-[9px] font-bold text-[#FF6B1A] shrink-0">
                              {i + 1}
                            </div>
                            <span className="text-xs font-semibold text-white truncate">
                              {s.name}
                            </span>
                          </div>
                          <span className="text-xs text-white/50">
                            {s.payments} payment{s.payments !== 1 ? "s" : ""}
                          </span>
                          <span className="text-xs font-mono font-bold text-[#FFB800]">
                            ₱{s.amount.toLocaleString()}
                          </span>
                          <span className="text-xs text-white/50">
                            {s.walkIns} registered
                          </span>
                        </div>
                        <div className="ml-7 h-0.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FF6B1A] rounded-full"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <ChartDivider />
                  <div className="grid grid-cols-4 gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      Total
                    </span>
                    <span className="text-xs font-bold text-white">
                      {staffStats.reduce((s, x) => s + x.payments, 0)} payments
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
        </div>

        {/* ── Footer ── */}
        <div className="text-center py-4 border-t border-white/[0.06]">
          <p className="text-[10px] text-white/20 tracking-widest uppercase">
            {gymName} · Generated {new Date().toLocaleString("en-PH")} ·{" "}
            {formatDate(range.from)} — {formatDate(range.to)}
          </p>
        </div>
      </div>
    </>
  );
}
