import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import StaffLayout from "../layouts/StaffLayout";
import { walkInService } from "../services/walkInService";
import type { WalkInRegisterResponse } from "../types";

// ── TYPES ──────────────────────────────────────────────────
interface Member {
  id: string;
  name: string;
  plan: string;
  status: string;
  expires: string;
}

// ── MAIN COMPONENT ─────────────────────────────────────────
export default function StaffDashboard() {
  const [activePage, setActivePage] = useState("checkin");

  const pageTitles: Record<string, string> = {
    checkin: "Check-in Desk",
    walkin: "Walk-in Registration",
    members: "Members",
  };

  return (
    <StaffLayout
      activePage={activePage}
      onPageChange={setActivePage}
      pageTitle={pageTitles[activePage] ?? "Check-in Desk"}>
      {activePage === "checkin" && <CheckInDesk />}
      {activePage === "walkin" && <WalkInDesk />}
      {activePage === "members" && <PlaceholderContent />}
    </StaffLayout>
  );
}

// ── CHECK-IN DESK ──────────────────────────────────────────
// NOTE: Member list and check-in actions are still mock data.
// This will be wired to the real API in Phase 2 member endpoints.
function CheckInDesk() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "info">("success");

  const members: Member[] = [
    {
      id: "GYM-1042",
      name: "Juan dela Cruz",
      plan: "Monthly",
      status: "Active",
      expires: "Apr 13, 2026",
    },
    {
      id: "GYM-0987",
      name: "Maria Santos",
      plan: "Annual",
      status: "Active",
      expires: "Jan 5, 2027",
    },
    {
      id: "GYM-1103",
      name: "Pedro Mendoza",
      plan: "Monthly",
      status: "Expiring",
      expires: "Mar 19, 2026",
    },
    {
      id: "GYM-0234",
      name: "Carlo Reyes",
      plan: "VIP",
      status: "Active",
      expires: "Dec 31, 2026",
    },
    {
      id: "GYM-0445",
      name: "Ana Lim",
      plan: "Monthly",
      status: "Overdue",
      expires: "Mar 1, 2026",
    },
    {
      id: "GYM-1188",
      name: "Rico Villanueva",
      plan: "Annual",
      status: "Active",
      expires: "Mar 13, 2027",
    },
    {
      id: "GYM-0312",
      name: "Jasmine Aquino",
      plan: "Monthly",
      status: "Active",
      expires: "Apr 1, 2026",
    },
    {
      id: "GYM-0576",
      name: "Dante Garcia",
      plan: "VIP",
      status: "Active",
      expires: "Jun 30, 2026",
    },
  ];

  const filtered =
    search.trim().length >= 2
      ? members.filter(
          (m) =>
            m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.id.toLowerCase().includes(search.toLowerCase()),
        )
      : [];

  const showToast = (msg: string, type: "success" | "info" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const handleCheckIn = (member: Member) => {
    if (member.status === "Overdue") return;
    const isCheckedIn = checkedInIds.has(member.id);
    const newSet = new Set(checkedInIds);

    if (isCheckedIn) {
      newSet.delete(member.id);
      setCheckedInIds(newSet);
      showToast(
        `${member.name.split(" ")[0]} checked out successfully`,
        "info",
      );
    } else {
      newSet.add(member.id);
      setCheckedInIds(newSet);
      showToast(`Welcome back, ${member.name.split(" ")[0]}! ✓`);
    }
    setSearch("");
    setSelectedMember(null);
  };

  const getStatusColor = (status: string) => {
    if (status === "Active")
      return "text-[#FF6B1A] bg-[#FF6B1A]/10 border-[#FF6B1A]/20";
    if (status === "Expiring")
      return "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20";
    if (status === "Overdue")
      return "text-red-400 bg-red-400/10 border-red-400/20";
    return "text-white/40 bg-white/5 border-white/10";
  };

  const todayLog = [
    { id: "GYM-1042", name: "Juan dela Cruz", time: "11:34", action: "in" },
    { id: "GYM-0987", name: "Maria Santos", time: "11:29", action: "in" },
    { id: "GYM-0234", name: "Carlo Reyes", time: "11:02", action: "in" },
    { id: "GYM-0987", name: "Maria Santos", time: "10:55", action: "out" },
    { id: "GYM-0576", name: "Dante Garcia", time: "10:33", action: "in" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Greeting */}
      <div>
        <h2 className="text-lg font-bold text-white">
          Welcome, {user?.name?.split(" ")[0]}! 👋
        </h2>
        <p className="text-xs text-white/30 mt-0.5">
          {new Date().toLocaleDateString("en-PH", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${
            toastType === "success"
              ? "bg-[#FF6B1A] text-black"
              : "bg-blue-500 text-white"
          }`}>
          {toastMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Member Lookup */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4">
            Member Lookup
          </h3>

          <div className="relative mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedMember(null);
              }}
              placeholder="Search by name or GYM-0000..."
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors pr-10"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setSelectedMember(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs">
                ✕
              </button>
            )}
          </div>

          {filtered.length > 0 && !selectedMember && (
            <div className="bg-[#2a2a2a] rounded-lg overflow-hidden border border-white/10 mb-4">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedMember(m);
                    setSearch(m.name);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
                    {m.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {m.name}
                    </div>
                    <div className="text-xs text-white/30">
                      {m.id} · {m.plan}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getStatusColor(m.status)}`}>
                      {m.status}
                    </span>
                    {checkedInIds.has(m.id) && (
                      <span className="text-[10px] text-[#FF6B1A]">
                        ● In gym
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedMember && (
            <div
              className={`rounded-xl p-4 border mb-4 ${
                checkedInIds.has(selectedMember.id)
                  ? "bg-blue-400/5 border-blue-400/20"
                  : "bg-[#FF6B1A]/5 border-[#FF6B1A]/20"
              }`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/30 flex items-center justify-center text-sm font-bold text-[#FF6B1A]">
                  {selectedMember.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white">
                    {selectedMember.name}
                  </div>
                  <div className="text-xs text-white/40">
                    {selectedMember.id} · {selectedMember.plan} · Expires{" "}
                    {selectedMember.expires}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full border ${getStatusColor(selectedMember.status)}`}>
                  {selectedMember.status}
                </span>
              </div>

              {selectedMember.status === "Overdue" ? (
                <button
                  disabled
                  className="w-full py-3 bg-transparent border border-[#FFB800]/30 text-[#FFB800] text-sm font-bold rounded-lg cursor-not-allowed opacity-60">
                  ⚠ Membership Overdue — See Front Desk
                </button>
              ) : checkedInIds.has(selectedMember.id) ? (
                <button
                  onClick={() => handleCheckIn(selectedMember)}
                  className="w-full py-3 bg-transparent border border-blue-400/40 text-blue-400 text-sm font-bold rounded-lg hover:bg-blue-400/10 transition-all active:scale-95">
                  ← Check Out
                </button>
              ) : (
                <button
                  onClick={() => handleCheckIn(selectedMember)}
                  className="w-full py-3 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95">
                  ✓ Check In
                </button>
              )}
            </div>
          )}

          {search.trim().length >= 2 && filtered.length === 0 && (
            <div className="text-center py-6 text-white/20">
              <div className="text-2xl mb-2">◉</div>
              <div className="text-xs">No member found</div>
              <div className="text-xs mt-1">Please see the front desk</div>
            </div>
          )}
          {!search && (
            <div className="text-center py-6 text-white/20">
              <div className="text-xs">
                Type at least 2 characters to search
              </div>
            </div>
          )}
        </div>

        {/* Today's Log */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Today's Log
            </h3>
            <span className="text-xs font-mono text-white/30">
              {todayLog.length} entries
            </span>
          </div>
          <div className="space-y-1">
            {todayLog.map((entry) => (
              // Fixed: composite key instead of array index
              <div
                key={`${entry.id}-${entry.time}-${entry.action}`}
                className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    entry.action === "in" ? "bg-[#FF6B1A]" : "bg-blue-400"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-[#FF6B1A] mr-2">
                    {entry.id}
                  </span>
                  <span className="text-xs text-white/60 truncate">
                    {entry.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-semibold ${
                      entry.action === "in" ? "text-[#FF6B1A]" : "text-blue-400"
                    }`}>
                    {entry.action === "in" ? "IN" : "OUT"}
                  </span>
                  <span className="text-[11px] font-mono text-white/30">
                    {entry.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── WALK-IN DESK ──────────────────────────────────────────
// Wired to real API via walkInService.register()
function WalkInDesk() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [passType, setPassType] = useState<"regular" | "student" | "couple">(
    "regular",
  );
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<
    WalkInRegisterResponse["walkIn"] | null
  >(null);
  const [errorMsg, setErrorMsg] = useState("");

  const prices: Record<string, number> = {
    regular: 150,
    student: 100,
    couple: 250,
  };

  const passConfig = [
    { type: "regular" as const, icon: "☀", label: "Regular", price: 150 },
    { type: "student" as const, icon: "◎", label: "Student", price: 100 },
    { type: "couple" as const, icon: "♡", label: "Couple", price: 250 },
  ];

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length > 7)
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    if (digits.length > 4) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return digits;
  };

  const handleSubmit = async () => {
    setErrorMsg("");

    if (!name.trim() || name.trim().split(" ").length < 2) {
      setErrorMsg("Please enter a full name (first and last)");
      return;
    }

    setLoading(true);
    try {
      const response = await walkInService.register({
        name: name.trim(),
        phone: phone.trim() || undefined,
        passType,
      });

      if (response.success) {
        setSuccess(response.walkIn);
      } else {
        setErrorMsg(response.message || "Failed to register walk-in.");
      }
    } catch (axiosError) {
      const err = axiosError as { response?: { data?: { message?: string } } };
      setErrorMsg(
        err.response?.data?.message ||
          "Failed to register walk-in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setName("");
    setPhone("");
    setPassType("regular");
    setSuccess(null);
    setErrorMsg("");
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto pb-24 lg:pb-6">
        <div className="bg-[#212121] border border-[#FF6B1A]/20 rounded-xl p-6 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#FF6B1A]/10 border-2 border-[#FF6B1A] flex items-center justify-center text-2xl mx-auto mb-4">
            ✓
          </div>
          <h3 className="text-xl font-bold text-[#FF6B1A] mb-1">
            Welcome, {success.name.split(" ")[0]}!
          </h3>
          <p className="text-xs text-white/40 mb-5">
            Walk-in registered successfully
          </p>

          <div className="bg-[#2a2a2a] rounded-xl p-4 mb-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
              Temporary ID
            </div>
            <div className="text-3xl font-mono font-bold text-[#FF6B1A] tracking-widest">
              {success.walkId}
            </div>
          </div>

          <div className="space-y-2 mb-6 text-left">
            {[
              { label: "Name", value: success.name },
              {
                label: "Pass Type",
                value:
                  success.passType.charAt(0).toUpperCase() +
                  success.passType.slice(1),
              },
              { label: "Amount", value: `₱${success.amount}` },
              {
                label: "Check-in",
                value: new Date(success.checkIn).toLocaleTimeString("en-PH", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ].map((row) => (
              <div key={row.label} className="flex justify-between text-xs">
                <span className="text-white/30">{row.label}</span>
                <span className="font-semibold text-white">{row.value}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="w-full py-3 bg-[#FF6B1A] text-black font-bold text-sm rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95">
            Register Another ➜
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-24 lg:pb-6">
      <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-5">
          New Walk-in Registration
        </h3>

        <div className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
              Full Name <span className="text-[#FF6B1A]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. Jose Rizal"
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
              Phone <span className="text-white/20">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="09XX XXX XXXX"
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {/* Pass Type — now includes couple */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
              Pass Type <span className="text-[#FF6B1A]">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {passConfig.map(({ type, icon, label, price }) => (
                <button
                  key={type}
                  onClick={() => setPassType(type)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    passType === type
                      ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                      : "border-white/10 bg-[#2a2a2a] text-white/40 hover:border-white/20"
                  }`}>
                  <div className="text-lg mb-1">{icon}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide">
                    {label}
                  </div>
                  <div className="text-xs font-mono font-bold mt-1">
                    ₱{price}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-xs">{errorMsg}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3.5 bg-[#FFB800] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed mt-2">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              `Register & Check In — ₱${prices[passType]} ➜`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PLACEHOLDER ──────────────────────────────────────────
function PlaceholderContent() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-white/20 pb-24 lg:pb-0">
      <div className="text-5xl mb-4">◉</div>
      <div className="text-lg font-bold uppercase tracking-widest">Members</div>
      <div className="text-sm mt-2">Coming soon</div>
    </div>
  );
}
