import { useState } from "react";
import OwnerLayout from "../layouts/OwnerLayout";
import { useAuthStore } from "../store/authStore";

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
      {activePage === "members" && (
        <PlaceholderContent title="Members" icon="◉" />
      )}
      {activePage === "walkins" && (
        <PlaceholderContent title="Walk-ins" icon="⊕" />
      )}
      {activePage === "payments" && (
        <PlaceholderContent title="Payments" icon="◈" />
      )}
      {activePage === "staff" && <PlaceholderContent title="Staff" icon="◎" />}
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

  // Greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const stats = [
    {
      label: "Total Members",
      value: "248",
      delta: "+12 this month",
      color: "text-[#FF6B1A]",
      border: "border-t-[#FF6B1A]",
      bg: "bg-[#FF6B1A]/5",
    },
    {
      label: "Active Today",
      value: "34",
      delta: "Peak: 11am–1pm",
      color: "text-[#FFB800]",
      border: "border-t-[#FFB800]",
      bg: "bg-[#FFB800]/5",
    },
    {
      label: "Monthly Revenue",
      value: "₱84.2K",
      delta: "+8.4% vs last month",
      color: "text-blue-400",
      border: "border-t-blue-400",
      bg: "bg-blue-400/5",
    },
    {
      label: "Expiring Soon",
      value: "7",
      delta: "Within 7 days",
      color: "text-red-400",
      border: "border-t-red-400",
      bg: "bg-red-400/5",
    },
  ];

  const checkIns = [
    { id: "GYM-1042", name: "Juan dela Cruz", time: "11:34", type: "check-in" },
    { id: "GYM-0987", name: "Maria Santos", time: "11:29", type: "check-in" },
    { id: "GYM-1103", name: "Pedro Mendoza", time: "11:15", type: "expiring" },
    { id: "GYM-0234", name: "Carlo Reyes", time: "11:02", type: "check-in" },
    { id: "WALK-001", name: "Jose Rizal", time: "10:50", type: "walkin" },
    { id: "GYM-0576", name: "Dante Garcia", time: "10:33", type: "check-in" },
  ];

  const atRisk = [
    {
      id: "GYM-1103",
      name: "Pedro Mendoza",
      expires: "Mar 19",
      daysLeft: 2,
      status: "expiring",
    },
    {
      id: "GYM-0445",
      name: "Ana Lim",
      expires: "Mar 1",
      daysLeft: -16,
      status: "overdue",
    },
    {
      id: "GYM-0923",
      name: "Mark Bautista",
      expires: "Mar 22",
      daysLeft: 5,
      status: "expiring",
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

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95">
            <span>+</span> Add Member
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/30 text-xs font-bold rounded-lg hover:bg-[#FFB800]/20 transition-all active:scale-95">
            <span>⊕</span> Walk-in
          </button>
          <button className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-white/5 text-white/50 border border-white/10 text-xs font-bold rounded-lg hover:bg-white/10 transition-all">
            <span>↓</span> Export
          </button>
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
          { label: "Walk-ins Today", value: "2", color: "text-[#FFB800]" },
          { label: "Revenue", value: "₱250", color: "text-[#FF6B1A]" },
          { label: "Still Inside", value: "0", color: "text-blue-400" },
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
            {checkIns.map((item) => (
              <div
                key={item.id + item.time}
                className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.type === "check-in"
                      ? "bg-[#FF6B1A]"
                      : item.type === "expiring"
                        ? "bg-[#FFB800]"
                        : "bg-blue-400"
                  }`}
                />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span
                    className={`text-xs font-mono font-semibold flex-shrink-0 ${
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
                <span className="text-[11px] font-mono text-white/30 flex-shrink-0">
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Revenue Breakdown */}
          <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4">
              Revenue Breakdown
            </h3>
            <div className="space-y-2.5">
              {[
                {
                  label: "Monthly plans",
                  amount: "₱42,500",
                  color: "text-blue-400",
                },
                {
                  label: "Annual plans",
                  amount: "₱31,200",
                  color: "text-[#FF6B1A]",
                },
                {
                  label: "VIP plans",
                  amount: "₱10,500",
                  color: "text-purple-400",
                },
                {
                  label: "Walk-ins",
                  amount: "₱6,450",
                  color: "text-[#FFB800]",
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
                <span className="text-xs font-bold text-white">Total</span>
                <span className="text-sm font-mono font-bold text-white">
                  ₱84,200
                </span>
              </div>
            </div>
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
              {atRisk.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2.5 p-2.5 bg-[#2a2a2a] rounded-lg">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
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
                        ? `Overdue since ${member.expires}`
                        : `Expires ${member.expires} · ${member.daysLeft}d left`}
                    </div>
                  </div>
                  <button
                    className={`text-[10px] font-bold px-2 py-1 rounded border flex-shrink-0 ${
                      member.status === "overdue"
                        ? "text-red-400 border-red-400/30 hover:bg-red-400/10"
                        : "text-[#FFB800] border-[#FFB800]/30 hover:bg-[#FFB800]/10"
                    } transition-all`}>
                    {member.status === "overdue" ? "Notify" : "Remind"}
                  </button>
                </div>
              ))}
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
