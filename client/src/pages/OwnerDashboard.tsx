import { useState, useEffect, useCallback, useRef } from "react";
import MembersPage from "./MembersPage";
import WalkInsPage from "./WalkInsPage";
import PaymentsPage from "./PaymentsPage";
import StaffPage from "./StaffPage";
import ReportsPage from "./ReportsPage";
import OwnerLayout from "../layouts/OwnerLayout";
import { useAuthStore } from "../store/authStore";
import { useGymStore } from "../store/gymStore";
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
      pageTitle={pageTitles[activePage] ?? "Dashboard"}
    >
      {activePage === "dashboard" && (
        <DashboardContent onNavigate={setActivePage} />
      )}
      {activePage === "members" && <MembersPage />}
      {activePage === "walkins" && <WalkInsPage />}
      {activePage === "payments" && <PaymentsPage />}
      {activePage === "staff" && <StaffPage />}
      {activePage === "reports" && <ReportsPage />}
      {activePage === "settings" && (
        <PlaceholderContent title="Settings" icon="◌" />
      )}
    </OwnerLayout>
  );
}

// ── DASHBOARD CONTENT ──────────────────────────────────────
function DashboardContent({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { user } = useAuthStore();
  const { settings } = useGymStore();
  const gymName = settings?.gymName || "the gym";

  // ── State ──
  const [memberStats, setMemberStats] = useState({
    total: 0,
    checkedIn: 0,
    expiringSoon: 0,
    withBalance: 0,
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
  const [recentCheckins, setRecentCheckins] = useState<
    { id: string; name: string; gymId: string }[]
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

  const firstName = user?.name?.split(" ")[0] || "Owner";

  // ── Fetch all dashboard data ──
  const load = useCallback(async () => {
    // Members
    try {
      const [allMembers, expiringSoonRes, expiredRes, checkedInRes] =
        await Promise.all([
          memberService.getAll({ limit: 1 }),
          memberService.getAll({ status: "active", limit: 100 }),
          memberService.getAll({ status: "expired", limit: 10 }),
          memberService.getAll({ status: "active", limit: 200 }),
        ]);

      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const expiring = expiringSoonRes.members.filter((m) => {
        const exp = new Date(m.expiresAt);
        return exp >= now && exp <= in7Days;
      });

      const checkedInMembers = checkedInRes.members.filter((m) => m.checkedIn);
      const withBalance = checkedInRes.members.filter(
        (m) => m.balance > 0,
      ).length;

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
      ].slice(0, 6);

      setMemberStats({
        total: allMembers.total,
        checkedIn: checkedInMembers.length,
        expiringSoon: expiring.length,
        withBalance,
        loading: false,
      });

      setAtRisk(atRiskList);

      // Recent check-ins — members currently inside
      setRecentCheckins(
        checkedInMembers.slice(0, 8).map((m) => ({
          id: m.gymId,
          name: m.name,
          gymId: m.gymId,
        })),
      );
    } catch {
      setMemberStats((s) => ({ ...s, loading: false }));
    }

    // Payments
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

    // Walk-ins
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

  const statCards = [
    {
      label: "Total Members",
      value: memberStats.loading ? "—" : memberStats.total.toString(),
      sub: memberStats.loading ? "" : `${memberStats.checkedIn} inside now`,
      color: "text-[#FF6B1A]",
      border: "border-t-[#FF6B1A]",
      bg: "bg-[#FF6B1A]/5",
      onClick: () => onNavigate("members"),
    },
    {
      label: "Inside Now",
      value: memberStats.loading ? "—" : memberStats.checkedIn.toString(),
      sub: "Currently checked in",
      color: "text-[#FFB800]",
      border: "border-t-[#FFB800]",
      bg: "bg-[#FFB800]/5",
      onClick: () => onNavigate("members"),
    },
    {
      label: "Monthly Revenue",
      value: paymentSummary.loading ? "—" : fmt(paymentSummary.monthRevenue),
      sub: `Today: ${fmt(paymentSummary.todayRevenue)}`,
      color: "text-blue-400",
      border: "border-t-blue-400",
      bg: "bg-blue-400/5",
      onClick: () => onNavigate("payments"),
    },
    {
      label: "Expiring Soon",
      value: memberStats.loading ? "—" : memberStats.expiringSoon.toString(),
      sub: "Within 7 days",
      color: memberStats.expiringSoon > 0 ? "text-red-400" : "text-white/40",
      border:
        memberStats.expiringSoon > 0 ? "border-t-red-400" : "border-t-white/20",
      bg: memberStats.expiringSoon > 0 ? "bg-red-400/5" : "bg-white/[0.02]",
      onClick: () => onNavigate("members"),
    },
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-6 max-w-7xl mx-auto">
      {/* ── HEADER — greeting + quick actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {getGreeting()}, {firstName}! 👋
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            Here's what's happening at{" "}
            <span className="text-white/50 font-semibold">{gymName}</span>{" "}
            today.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => onNavigate("walkins")}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/25 text-xs font-bold rounded-lg hover:bg-[#FFB800]/20 transition-all cursor-pointer"
          >
            <span className="text-sm leading-none">+</span>
            Walk-in
          </button>
          <button
            onClick={() => onNavigate("members")}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all cursor-pointer"
          >
            <span className="text-sm leading-none">+</span>
            Add Member
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => (
          <button
            key={stat.label}
            onClick={stat.onClick}
            className={`${stat.bg} border border-white/10 border-t-2 ${stat.border} rounded-xl p-4 text-left transition-all hover:brightness-110 cursor-pointer`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
              {stat.label}
            </div>
            <div
              className={`text-2xl sm:text-3xl font-bold ${stat.color} mb-1`}
            >
              {stat.value}
            </div>
            <div className="text-[11px] text-white/30">{stat.sub}</div>
          </button>
        ))}
      </div>

      {/* ── WALK-IN SUMMARY — matching stat card style ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Walk-ins Today",
            value: walkInToday.loading ? "—" : walkInToday.count.toString(),
            sub: `${walkInToday.stillInside} still inside`,
            color: "text-[#FFB800]",
            border: "border-t-[#FFB800]",
            bg: "bg-[#FFB800]/5",
          },
          {
            label: "Walk-in Revenue",
            value: walkInToday.loading
              ? "—"
              : `₱${walkInToday.revenue.toLocaleString()}`,
            sub: "Day pass total",
            color: "text-[#FF6B1A]",
            border: "border-t-[#FF6B1A]",
            bg: "bg-[#FF6B1A]/5",
          },
          {
            label: "Outstanding Balances",
            value: memberStats.loading
              ? "—"
              : memberStats.withBalance.toString(),
            sub: "Members with unpaid balance",
            color:
              memberStats.withBalance > 0 ? "text-amber-400" : "text-white/40",
            border:
              memberStats.withBalance > 0
                ? "border-t-amber-400"
                : "border-t-white/20",
            bg:
              memberStats.withBalance > 0
                ? "bg-amber-400/5"
                : "bg-white/[0.02]",
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`${item.bg} border border-white/10 border-t-2 ${item.border} rounded-xl p-4`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
              {item.label}
            </div>
            <div className={`text-xl sm:text-2xl font-bold ${item.color} mb-1`}>
              {item.value}
            </div>
            <div className="text-[11px] text-white/30">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* ── MAIN TWO-COLUMN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Check-ins */}
        <div className="lg:col-span-2 bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Members Inside Now
            </h3>
            <span className="text-xs text-[#FF6B1A] bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#FF6B1A] inline-block"
                style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
              />
              Live
            </span>
          </div>

          {recentCheckins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="text-3xl mb-2 opacity-20">◉</div>
              <div className="text-white/25 text-sm font-semibold">
                No members inside
              </div>
              <div className="text-white/15 text-xs mt-1">
                Members will appear here when checked in
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentCheckins.map((m) => (
                <div
                  key={m.gymId}
                  className="flex items-center gap-3 p-3 bg-[#2a2a2a] rounded-lg border border-white/5"
                >
                  <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
                    {m.name
                      .split(" ")
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {m.name}
                    </div>
                    <div className="text-[10px] font-mono text-white/30">
                      {m.gymId}
                    </div>
                  </div>
                  <div
                    className="w-1.5 h-1.5 rounded-full bg-[#FF6B1A] shrink-0"
                    style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {recentCheckins.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[11px] text-white/25">
                {memberStats.checkedIn} member
                {memberStats.checkedIn !== 1 ? "s" : ""} currently inside
              </span>
              <button
                onClick={() => onNavigate("members")}
                className="text-[11px] text-[#FF6B1A] hover:text-[#ff8a45] transition-colors cursor-pointer"
              >
                View all members →
              </button>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Revenue Breakdown */}
          <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
                Revenue Breakdown
              </h3>
              <button
                onClick={() => onNavigate("payments")}
                className="text-[11px] text-[#FF6B1A] hover:text-[#ff8a45] transition-colors cursor-pointer"
              >
                View all →
              </button>
            </div>

            {paymentSummary.loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-8 bg-white/5 rounded animate-pulse"
                  />
                ))}
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
                    className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
                  >
                    <span className="text-xs text-white/40">{row.label}</span>
                    <span
                      className={`text-xs font-mono font-semibold ${row.color}`}
                    >
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
                At-Risk Members
              </h3>
              {/* Only show badge if there are at-risk members */}
              {atRisk.length > 0 ? (
                <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full font-semibold">
                  {atRisk.length}
                </span>
              ) : (
                <span className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full font-semibold">
                  ✓ All good
                </span>
              )}
            </div>

            {atRisk.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="text-2xl mb-1.5">✅</div>
                <div className="text-white/25 text-xs font-semibold">
                  No at-risk members
                </div>
                <div className="text-white/15 text-[11px] mt-0.5">
                  All memberships are in good standing
                </div>
              </div>
            ) : (
              <div className="space-y-2">
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
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          member.status === "overdue"
                            ? "bg-red-400/10 text-red-400"
                            : "bg-amber-400/10 text-amber-400"
                        }`}
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
                      <span
                        className={`text-[10px] font-mono font-semibold shrink-0 ${member.status === "overdue" ? "text-red-400/60" : "text-amber-400/60"}`}
                      >
                        {member.gymId}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
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
