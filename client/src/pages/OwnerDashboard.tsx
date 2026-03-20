import { useState, useEffect, useCallback, useRef } from "react";
import MembersPage from "./MembersPage";
import WalkInsPage from "./WalkInsPage";
import PaymentsPage from "./PaymentsPage";
import StaffPage from "./StaffPage";
import OwnerLayout from "../layouts/OwnerLayout";
import { useAuthStore } from "../store/authStore";
import { memberService } from "../services/memberService";
import { paymentService } from "../services/paymentService";
import { walkInService } from "../services/walkInService";

export default function OwnerDashboard() {
  const [activePage, setActivePage] = useState("dashboard");

  const pageTitles: Record<string, string> = {
    dashboard: "Dashboard",
    members: "Members",
    walkins: "Walk-ins",
    payments: "Payments",
    staff: "Staff",
    reports: "Reports",
    settings: "Settings",
  };

  return (
    <OwnerLayout
      activePage={activePage}
      onPageChange={setActivePage}
      pageTitle={pageTitles[activePage] ?? "Dashboard"}>
      {activePage === "dashboard" && <DashboardContent />}
      {activePage === "members" && <MembersPage />}
      {activePage === "walkins" && <WalkInsPage />}
      {activePage === "payments" && <PaymentsPage />}
      {activePage === "staff" && <StaffPage />}
      {activePage === "reports" && (
        <PlaceholderContent title="Reports" icon="▤" />
      )}
      {activePage === "settings" && (
        <PlaceholderContent title="Settings" icon="◌" />
      )}
    </OwnerLayout>
  );
}

// ── DASHBOARD CONTENT ──────────────────────────────────────
function DashboardContent() {
  const { user } = useAuthStore();

  // ── State ──
  const [memberStats, setMemberStats] = useState({
    total: 0,
    checkedIn: 0,
    expiringSoon: 0,
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
  const [recentActivity, setRecentActivity] = useState<
    { id: string; name: string; time: string; type: string }[]
  >([]);
  const [atRisk, setAtRisk] = useState<
    {
      gymId: string;
      name: string;
      expiresAt: string;
      daysLeft: number;
      status: string;
    }[]
  >([]);

  // ── Greeting ──
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // ── Fetch all dashboard data ──
  const load = useCallback(async () => {
    try {
      const [allMembers, expiringSoonRes] = await Promise.all([
        memberService.getAll({ limit: 1 }),
        memberService.getAll({ status: "active", limit: 50 }),
      ]);
      const checkedInCount = (
        await memberService.getAll({ status: "active", limit: 500 })
      ).members.filter((m) => m.checkedIn).length;
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const expiring = expiringSoonRes.members.filter((m) => {
        const exp = new Date(m.expiresAt);
        return exp >= now && exp <= in7Days;
      });
      const expiredRes = await memberService.getAll({
        status: "expired",
        limit: 20,
      });
      const atRiskList = [
        ...expiring.map((m) => ({
          gymId: m.gymId,
          name: m.name,
          expiresAt: m.expiresAt,
          daysLeft: Math.ceil(
            (new Date(m.expiresAt).getTime() - now.getTime()) / 86400000,
          ),
          status: "expiring",
        })),
        ...expiredRes.members.slice(0, 5).map((m) => ({
          gymId: m.gymId,
          name: m.name,
          expiresAt: m.expiresAt,
          daysLeft: Math.ceil(
            (new Date(m.expiresAt).getTime() - now.getTime()) / 86400000,
          ),
          status: "overdue",
        })),
      ].slice(0, 5);
      setMemberStats({
        total: allMembers.total,
        checkedIn: checkedInCount,
        expiringSoon: expiring.length,
        loading: false,
      });
      setAtRisk(atRiskList);
      const checkedInMembers = (
        await memberService.getAll({ status: "active", limit: 20 })
      ).members.filter((m) => m.checkedIn);
      setRecentActivity(
        checkedInMembers.slice(0, 6).map((m) => ({
          id: m.gymId,
          name: m.name,
          time: "Now",
          type: "check-in",
        })),
      );
    } catch {
      setMemberStats((s) => ({ ...s, loading: false }));
    }
    try {
      const summary = await paymentService.getSummary();
      setPaymentSummary({
        monthRevenue: summary.month?.revenue ?? 0,
        todayRevenue: summary.today?.revenue ?? 0,
        loading: false,
      });
    } catch {
      setPaymentSummary((s) => ({ ...s, loading: false }));
    }
    try {
      const walkins = await walkInService.getToday();
      setWalkInToday({
        count: walkins.summary?.total ?? 0,
        revenue: walkins.summary?.revenue ?? 0,
        stillInside:
          walkins.walkIns?.filter((w) => !w.isCheckedOut).length ?? 0,
        loading: false,
      });
    } catch {
      setWalkInToday((s) => ({ ...s, loading: false }));
    }
  }, []);

  // Initial load + auto-refresh every 30s
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    loadRef.current();
    const id = setInterval(() => loadRef.current(), 30000);
    return () => clearInterval(id);
  }, []);

  const fmt = (n: number) =>
    n >= 1000 ? `₱${(n / 1000).toFixed(1)}K` : `₱${n.toLocaleString()}`;

  const stats = [
    {
      label: "Total Members",
      value: memberStats.loading ? "—" : memberStats.total.toString(),
      delta: memberStats.loading ? "" : `${memberStats.checkedIn} checked in`,
      color: "text-[#FF6B1A]",
      border: "border-t-[#FF6B1A]",
      bg: "bg-[#FF6B1A]/5",
    },
    {
      label: "Active Today",
      value: memberStats.loading ? "—" : memberStats.checkedIn.toString(),
      delta: "Currently inside",
      color: "text-[#FFB800]",
      border: "border-t-[#FFB800]",
      bg: "bg-[#FFB800]/5",
    },
    {
      label: "Monthly Revenue",
      value: paymentSummary.loading ? "—" : fmt(paymentSummary.monthRevenue),
      delta: `Today: ${fmt(paymentSummary.todayRevenue)}`,
      color: "text-blue-400",
      border: "border-t-blue-400",
      bg: "bg-blue-400/5",
    },
    {
      label: "Expiring Soon",
      value: memberStats.loading ? "—" : memberStats.expiringSoon.toString(),
      delta: "Within 7 days",
      color: "text-red-400",
      border: "border-t-red-400",
      bg: "bg-red-400/5",
    },
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-6 max-w-7xl mx-auto">
      {/* ── GREETING + QUICK ACTIONS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {getGreeting()}, {user?.name?.split(" ")[0]}! 👋
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            Here's what's happening at IronCore today.
          </p>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bg} border border-white/10 border-t-2 ${stat.border} rounded-xl p-4`}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
              {stat.label}
            </div>
            <div
              className={`text-2xl sm:text-3xl font-bold ${stat.color} mb-1`}>
              {stat.value}
            </div>
            <div className="text-[11px] text-white/30">{stat.delta}</div>
          </div>
        ))}
      </div>

      {/* ── TODAY'S WALK-IN SUMMARY ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Walk-ins Today",
            value: walkInToday.loading ? "—" : walkInToday.count.toString(),
            color: "text-[#FFB800]",
          },
          {
            label: "Revenue",
            value: walkInToday.loading
              ? "—"
              : `₱${walkInToday.revenue.toLocaleString()}`,
            color: "text-[#FF6B1A]",
          },
          {
            label: "Still Inside",
            value: walkInToday.loading
              ? "—"
              : walkInToday.stillInside.toString(),
            color: "text-blue-400",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[#212121] border border-white/10 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1">
              {item.label}
            </div>
            <div className={`text-xl sm:text-2xl font-bold ${item.color}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN TWO COLUMN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Check-ins */}
        <div className="lg:col-span-2 bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Recent Check-ins
            </h3>
            <span className="text-xs text-[#FF6B1A] bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 px-2 py-0.5 rounded-full font-semibold">
              ● Live
            </span>
          </div>
          <div className="space-y-1">
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-white/20 text-xs">
                No check-ins yet today
              </div>
            ) : (
              recentActivity.map((item) => (
                <div
                  key={item.id + item.time}
                  className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      item.type === "check-in"
                        ? "bg-[#FF6B1A]"
                        : item.type === "expiring"
                          ? "bg-[#FFB800]"
                          : "bg-blue-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-semibold shrink-0 ${
                        item.id.startsWith("WALK")
                          ? "text-[#FFB800]"
                          : "text-[#FF6B1A]"
                      }`}>
                      {item.id}
                    </span>
                    <span className="text-xs text-white/60 truncate">
                      {item.name}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-white/30 shrink-0">
                    {item.time}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Revenue Breakdown */}
          <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4">
              Revenue Breakdown
            </h3>
            {paymentSummary.loading ? (
              <div className="text-center py-6 text-white/20 text-xs">
                Loading...
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
                ⚠ At-Risk Members
              </h3>
              <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full font-semibold">
                {atRisk.length}
              </span>
            </div>
            <div className="space-y-2">
              {atRisk.length === 0 ? (
                <div className="text-center py-6 text-white/20 text-xs">
                  No at-risk members
                </div>
              ) : (
                atRisk.map((member) => {
                  const expiresLabel = new Date(
                    member.expiresAt,
                  ).toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <div
                      key={member.gymId}
                      className="flex items-center gap-2.5 p-2.5 bg-[#2a2a2a] rounded-lg">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          member.status === "overdue"
                            ? "bg-red-400/10 text-red-400"
                            : "bg-[#FFB800]/10 text-[#FFB800]"
                        }`}>
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
                          className={`text-[10px] ${
                            member.status === "overdue"
                              ? "text-red-400"
                              : "text-[#FFB800]"
                          }`}>
                          {member.status === "overdue"
                            ? `Overdue since ${expiresLabel}`
                            : `Expires ${expiresLabel} · ${member.daysLeft}d left`}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono font-semibold shrink-0 ${
                          member.status === "overdue"
                            ? "text-red-400"
                            : "text-[#FFB800]"
                        }`}>
                        {member.gymId}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PLACEHOLDER ──────────────────────────────────────────
function PlaceholderContent({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-white/20 pb-24 lg:pb-0">
      <div className="text-5xl mb-4">{icon}</div>
      <div className="text-lg font-bold uppercase tracking-widest">{title}</div>
      <div className="text-sm mt-2 text-white/20">Coming soon</div>
    </div>
  );
}
