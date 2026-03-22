/**
 * StaffDashboard.tsx
 * IronCore GMS — Staff Portal
 *
 * Pages:
 *   checkin — Member check-in / check-out desk (real API)
 *   walkin  — Walk-in registration + checkout (real API)
 *   members — Placeholder (Phase 3)
 */

import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import StaffLayout from "../layouts/StaffLayout";
import { memberService } from "../services/memberService";
import MembersPage from "./MembersPage";
import { walkInService } from "../services/walkInService";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
import type { Member, WalkIn, WalkInRegisterResponse } from "../types";

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StaffDashboard() {
  const [activePage, setActivePage] = useState("checkin");

  const pageTitles: Record<string, string> = {
    checkin: "Check-in Desk",
    walkin: "Walk-in Desk",
    members: "Members",
  };

  return (
    <StaffLayout
      activePage={activePage}
      onPageChange={setActivePage}
      pageTitle={pageTitles[activePage] ?? "Check-in Desk"}
    >
      {activePage === "checkin" && <CheckInDesk />}
      {activePage === "walkin" && <WalkInDesk />}
      {activePage === "members" && <MembersPage forceStaffView />}
    </StaffLayout>
  );
}

// ─── Check-in Desk ────────────────────────────────────────────────────────────

function CheckInDesk() {
  const { user } = useAuthStore();
  const { showToast } = useToastStore();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [todayLog, setTodayLog] = useState<
    { gymId: string; name: string; time: string; action: "in" | "out" }[]
  >([]);
  const [logPage, setLogPage] = useState(1);
  const LOG_PAGE_SIZE = 10;
  const inputRef = useRef<HTMLInputElement>(null);

  // On mount — load members currently checked in so log survives page navigation
  useEffect(() => {
    const loadCheckedIn = async () => {
      try {
        const res = await memberService.getAll({ limit: 100 });
        const inside = res.members.filter((m) => m.checkedIn);
        if (inside.length > 0) {
          setTodayLog(
            inside.map((m) => ({
              gymId: m.gymId,
              name: m.name,
              time: "—",
              action: "in" as const,
            })),
          );
        }
      } catch {
        /* silent — log is non-critical */
      }
    };
    loadCheckedIn();
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      setSelected(null);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await memberService.getAll({
          search: search.trim(),
          limit: 6,
          status: "active",
        });
        setResults(res.members);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const selectMember = (m: Member) => {
    setSelected(m);
    setSearch(m.name);
    setResults([]);
  };

  const handleCheckIn = async (member: Member) => {
    setActionLoading(true);
    try {
      await memberService.checkIn(member.gymId);
      showToast(`Welcome back, ${member.name.split(" ")[0]}! ✓`, "success");
      setTodayLog((prev) => [
        {
          gymId: member.gymId,
          name: member.name,
          time: new Date().toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          action: "in",
        },
        ...prev.slice(0, 19),
      ]);
      setLogPage(1);
      setSearch("");
      setSelected(null);
      setResults([]);
      inputRef.current?.focus();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast(err.response?.data?.message || "Check-in failed.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async (member: Member) => {
    setActionLoading(true);
    try {
      await memberService.checkOut(member.gymId);
      showToast(`${member.name.split(" ")[0]} checked out.`, "info");
      setTodayLog((prev) => [
        {
          gymId: member.gymId,
          name: member.name,
          time: new Date().toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          action: "out",
        },
        ...prev.slice(0, 19),
      ]);
      setLogPage(1);
      setSearch("");
      setSelected(null);
      setResults([]);
      inputRef.current?.focus();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast(err.response?.data?.message || "Check-out failed.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const STATUS_STYLES: Record<string, string> = {
    active: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    inactive: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    expired: "text-red-400 bg-red-400/10 border-red-400/20",
  };

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Member Lookup ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-4">
            Member Lookup
          </h3>

          {/* Search input */}
          <div className="relative mb-3">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(null);
              }}
              placeholder="Name or GYM-ID..."
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors pr-10"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setSelected(null);
                  setResults([]);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Searching indicator */}
          {searching && (
            <div className="text-center py-4 text-white/20 text-xs">
              Searching...
            </div>
          )}

          {/* Results dropdown */}
          {!searching && results.length > 0 && !selected && (
            <div className="bg-[#2a2a2a] rounded-lg border border-white/10 mb-3 overflow-hidden">
              {results.map((m) => (
                <button
                  key={m.gymId}
                  onClick={() => selectMember(m)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors text-left cursor-pointer"
                >
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
                      {m.gymId} · {m.plan}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[m.status] ?? "text-white/30"}`}
                    >
                      {m.status}
                    </span>
                    {m.checkedIn && (
                      <span className="text-[10px] text-[#FF6B1A]">
                        ● Inside
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {!searching && search.trim() && results.length === 0 && !selected && (
            <div className="text-center py-6 text-white/20">
              <div className="text-2xl mb-2">◉</div>
              <div className="text-xs">No member found</div>
              <div className="text-xs mt-1">Check the name or GYM-ID</div>
            </div>
          )}

          {/* Selected member card */}
          {selected && (
            <div
              className={`rounded-xl p-4 border mb-1 ${
                selected.checkedIn
                  ? "bg-blue-400/5 border-blue-400/20"
                  : "bg-[#FF6B1A]/5 border-[#FF6B1A]/20"
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/30 flex items-center justify-center text-sm font-bold text-[#FF6B1A] shrink-0">
                  {selected.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white">{selected.name}</div>
                  <div className="text-xs text-white/40">
                    {selected.gymId} · {selected.plan} · Expires{" "}
                    {new Date(selected.expiresAt).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full border ${STATUS_STYLES[selected.status] ?? "text-white/30"}`}
                >
                  {selected.status}
                </span>
              </div>

              {/* Action button */}
              {selected.status === "expired" ||
              selected.status === "inactive" ? (
                <button
                  disabled
                  className="w-full py-3 bg-transparent border border-amber-400/30 text-amber-400 text-sm font-bold rounded-lg cursor-not-allowed opacity-60"
                >
                  ⚠ Membership {selected.status} — See Front Desk
                </button>
              ) : selected.checkedIn ? (
                <button
                  onClick={() => handleCheckOut(selected)}
                  disabled={actionLoading}
                  className="w-full py-3 bg-transparent border border-blue-400/40 text-blue-400 text-sm font-bold rounded-lg hover:bg-blue-400/10 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? "Processing..." : "← Check Out"}
                </button>
              ) : (
                <button
                  onClick={() => handleCheckIn(selected)}
                  disabled={actionLoading}
                  className="w-full py-3 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? "Processing..." : "✓ Check In"}
                </button>
              )}
            </div>
          )}

          {/* Idle hint */}
          {!search && !selected && (
            <div className="text-center py-6 text-white/20">
              <div className="text-xs">Type a name or GYM-ID to search</div>
            </div>
          )}
        </div>

        {/* ── Today's Log ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Today's Log
            </h3>
            <span className="text-xs font-mono text-white/30">
              {todayLog.length} entries
            </span>
          </div>

          {todayLog.length === 0 ? (
            <div className="text-center py-10 text-white/20">
              <div className="text-2xl mb-2">◉</div>
              <div className="text-xs">No activity yet today</div>
            </div>
          ) : (
            <>
              <div className="space-y-0.5">
                {todayLog
                  .slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE)
                  .map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                    >
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${entry.action === "in" ? "bg-[#FF6B1A]" : "bg-blue-400"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-mono text-[#FF6B1A] mr-2">
                          {entry.gymId}
                        </span>
                        <span className="text-xs text-white/60 truncate">
                          {entry.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-semibold ${entry.action === "in" ? "text-[#FF6B1A]" : "text-blue-400"}`}
                        >
                          {entry.action === "in" ? "IN" : "OUT"}
                        </span>
                        <span className="text-[11px] font-mono text-white/30">
                          {entry.time}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
              {/* Pagination */}
              {todayLog.length > LOG_PAGE_SIZE && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <span className="text-[10px] text-white/30">
                    {(logPage - 1) * LOG_PAGE_SIZE + 1}–
                    {Math.min(logPage * LOG_PAGE_SIZE, todayLog.length)} of{" "}
                    {todayLog.length}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                      disabled={logPage === 1}
                      className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      ←
                    </button>
                    <button
                      onClick={() =>
                        setLogPage((p) =>
                          Math.min(
                            Math.ceil(todayLog.length / LOG_PAGE_SIZE),
                            p + 1,
                          ),
                        )
                      }
                      disabled={
                        logPage === Math.ceil(todayLog.length / LOG_PAGE_SIZE)
                      }
                      className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Walk-in Desk ─────────────────────────────────────────────────────────────

function WalkInDesk() {
  const { showToast } = useToastStore();
  const { getWalkInPrice } = useGymStore();
  const [tab, setTab] = useState<"register" | "checkout">("register");

  // Register state
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

  // Checkout state
  const [walkIns, setWalkIns] = useState<WalkIn[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const passConfig = [
    {
      type: "regular" as const,
      icon: "☀",
      label: "Regular",
      price: getWalkInPrice("regular"),
    },
    {
      type: "student" as const,
      icon: "◎",
      label: "Student",
      price: getWalkInPrice("student"),
    },
    {
      type: "couple" as const,
      icon: "♡",
      label: "Couple",
      price: getWalkInPrice("couple"),
    },
  ];

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length > 7)
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    if (digits.length > 4) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return digits;
  };

  // Load today's walk-ins when switching to checkout tab
  useEffect(() => {
    if (tab !== "checkout") return;
    const load = async () => {
      setTodayLoading(true);
      try {
        const res = await walkInService.getToday();
        // Only show still-inside walk-ins at the top, checked out below
        setWalkIns(res.walkIns);
      } catch {
        showToast("Failed to load today's walk-ins.", "error");
      } finally {
        setTodayLoading(false);
      }
    };
    load();
  }, [tab, showToast]);

  const handleRegister = async () => {
    setErrorMsg("");
    if (!name.trim() || name.trim().split(" ").length < 2) {
      setErrorMsg("Please enter a full name (first and last).");
      return;
    }
    setLoading(true);
    try {
      const response = await walkInService.register({
        name: name.trim(),
        phone: phone.trim() || undefined,
        passType,
      });
      setSuccess(response.walkIn);
      showToast(`${name.split(" ")[0]} registered successfully.`, "success");
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setErrorMsg(
        err.response?.data?.message ||
          "Failed to register walk-in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async (walkId: string, guestName: string) => {
    setCheckingOut(walkId);
    try {
      await walkInService.checkOut(walkId);
      showToast(`${guestName.split(" ")[0]} checked out.`, "info");
      setWalkIns((prev) =>
        prev.map((w) =>
          w.walkId === walkId ? { ...w, isCheckedOut: true } : w,
        ),
      );
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast(err.response?.data?.message || "Checkout failed.", "error");
    } finally {
      setCheckingOut(null);
    }
  };

  const handleReset = () => {
    setName("");
    setPhone("");
    setPassType("regular");
    setSuccess(null);
    setErrorMsg("");
  };

  const inside = walkIns.filter((w) => !w.isCheckedOut);
  const checkedOut = walkIns.filter((w) => w.isCheckedOut);

  return (
    <div className="max-w-md mx-auto pb-24 lg:pb-6 space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-[#212121] border border-white/10 rounded-lg p-1">
        {(["register", "checkout"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSuccess(null);
              setErrorMsg("");
            }}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide rounded-md transition-all cursor-pointer ${
              tab === t
                ? "bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/30"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {t === "register"
              ? "Register"
              : `Check Out ${inside.length > 0 && tab === "checkout" ? `(${inside.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── Register Tab ── */}
      {tab === "register" && (
        <>
          {success ? (
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
                    value: new Date(success.checkIn).toLocaleTimeString(
                      "en-PH",
                      { hour: "2-digit", minute: "2-digit" },
                    ),
                  },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-white/30">{row.label}</span>
                    <span className="font-semibold text-white">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleReset}
                className="w-full py-3 bg-[#FF6B1A] text-black font-bold text-sm rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer"
              >
                Register Another ➜
              </button>
            </div>
          ) : (
            <div className="bg-[#212121] border border-white/10 rounded-xl p-4 sm:p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/50 mb-5">
                New Walk-in
              </h3>
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
                    Full Name <span className="text-[#FF6B1A]">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRegister()}
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
                {/* Pass type */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-white/40 mb-2">
                    Pass Type <span className="text-[#FF6B1A]">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {passConfig.map(({ type, icon, label, price }) => (
                      <button
                        key={type}
                        onClick={() => setPassType(type)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                          passType === type
                            ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                            : "border-white/10 bg-[#2a2a2a] text-white/40 hover:border-white/20"
                        }`}
                      >
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
                  onClick={handleRegister}
                  disabled={loading}
                  className="w-full py-3.5 bg-[#FFB800] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ffc933] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed mt-2 cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    `Register & Check In — ₱${passConfig.find((p) => p.type === passType)?.price} ➜`
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Checkout Tab ── */}
      {tab === "checkout" && (
        <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-white/50">
              Today's Walk-ins
            </span>
            <span className="text-xs font-mono text-white/30">
              {inside.length} inside
            </span>
          </div>

          {todayLoading && (
            <div className="py-10 text-center text-white/20 text-xs">
              Loading...
            </div>
          )}

          {!todayLoading && inside.length === 0 && (
            <div className="py-10 text-center text-white/20">
              <div className="text-2xl mb-2">⊕</div>
              <div className="text-xs">No one currently inside</div>
            </div>
          )}

          {/* Still inside — can check out */}
          {inside.map((w) => (
            <div
              key={w._id}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-white/5 last:border-0"
            >
              <div
                className="w-2 h-2 rounded-full bg-[#FF6B1A] shrink-0"
                style={{ animation: "pulse 2s infinite" }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {w.name}
                </div>
                <div className="text-[10px] text-white/30 font-mono">
                  {w.walkId} · {w.passType}
                </div>
              </div>
              <button
                onClick={() => handleCheckOut(w.walkId, w.name)}
                disabled={checkingOut === w.walkId}
                className="px-3 py-1.5 text-xs font-semibold border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {checkingOut === w.walkId ? "..." : "Check Out"}
              </button>
            </div>
          ))}

          {/* Already checked out */}
          {checkedOut.length > 0 && (
            <>
              <div className="px-5 py-2 bg-white/[0.02] border-t border-white/5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/20">
                  Already checked out
                </span>
              </div>
              {checkedOut.map((w) => (
                <div
                  key={w._id}
                  className="flex items-center gap-3 px-5 py-3 border-b border-white/5 last:border-0 opacity-40"
                >
                  <div className="w-2 h-2 rounded-full bg-white/20 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {w.name}
                    </div>
                    <div className="text-[10px] text-white/30 font-mono">
                      {w.walkId} · {w.passType}
                    </div>
                  </div>
                  <span className="text-[10px] text-white/30 font-mono">
                    Out
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
