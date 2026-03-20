/**
 * PaymentsPage.tsx
 * IronCore GMS — Payments (Owner View)
 *
 * Features:
 *   - Revenue summary cards (today / this week / this month)
 *   - Cash vs GCash breakdown
 *   - Full payment list with search, method filter, date range
 *   - Manual payment logger — log a payment for any member
 *   - Processed by column
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { paymentService } from "../services/paymentService";
import { memberService } from "../services/memberService";
import { useToastStore } from "../store/toastStore";
import type {
  Payment,
  PaymentSummary,
  PaymentSummaryItem,
} from "../services/paymentService";
import type { Member } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const TYPE_LABELS: Record<string, string> = {
  new_member: "New Member",
  renewal: "Renewal",
  manual: "Manual",
  balance_settlement: "Settlement",
};
const TYPE_COLORS: Record<string, string> = {
  new_member: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  renewal: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  manual: "text-white/50 bg-white/5 border-white/10",
  balance_settlement: "text-amber-400 bg-amber-400/10 border-amber-400/20",
};
const METHOD_COLORS: Record<string, string> = {
  cash: "text-[#FFB800] bg-[#FFB800]/10 border-[#FFB800]/20",
  online: "text-blue-400 bg-blue-400/10 border-blue-400/20",
};

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummarySection({ summary }: { summary: PaymentSummary }) {
  const [active, setActive] = useState<"today" | "week" | "month">("today");
  const raw = summary[active];
  // Null-safe defaults in case server returns old shape
  const data: PaymentSummaryItem = {
    total: raw?.total ?? 0,
    revenue: raw?.revenue ?? 0,
    cash: raw?.cash ?? 0,
    online: raw?.online ?? 0,
    cashRev: raw?.cashRev ?? 0,
    onlineRev: raw?.onlineRev ?? 0,
    partial: raw?.partial ?? 0,
    outstanding: raw?.outstanding ?? 0,
  };

  return (
    <div className="bg-[#212121] border border-white/10 rounded-xl p-5">
      {/* Period tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
          Revenue
        </div>
        <div className="flex gap-1 bg-[#2a2a2a] rounded-lg p-0.5">
          {(["today", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setActive(p)}
              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide rounded-md transition-all cursor-pointer ${
                active === p
                  ? "bg-[#FF6B1A]/20 text-[#FF6B1A]"
                  : "text-white/30 hover:text-white/60"
              }`}>
              {p === "today"
                ? "Today"
                : p === "week"
                  ? "This Week"
                  : "This Month"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total revenue */}
        <div className="col-span-2 sm:col-span-1 bg-[#FF6B1A]/5 border border-t-2 border-[#FF6B1A]/20 border-t-[#FF6B1A] rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
            Total Revenue
          </div>
          <div className="text-3xl font-bold text-[#FF6B1A]">
            ₱{data.revenue.toLocaleString()}
          </div>
          <div className="text-[11px] text-white/30 mt-1">
            {data.total} payment{data.total !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Cash */}
        <div className="bg-[#FFB800]/5 border border-t-2 border-[#FFB800]/20 border-t-[#FFB800] rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
            Cash
          </div>
          <div className="text-2xl font-bold text-[#FFB800]">
            ₱{data.cashRev.toLocaleString()}
          </div>
          <div className="text-[11px] text-white/30 mt-1">
            {data.cash} payment{data.cash !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Online */}
        <div className="bg-blue-400/5 border border-t-2 border-blue-400/20 border-t-blue-400 rounded-xl p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
            Online
          </div>
          <div className="text-2xl font-bold text-blue-400">
            ₱{data.onlineRev.toLocaleString()}
          </div>
          <div className="text-[11px] text-white/30 mt-1">
            {data.online} payment{data.online !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Outstanding balances */}
        <div className="bg-amber-400/5 border border-t-2 border-amber-400/20 border-t-amber-400 rounded-xl p-4 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
            Outstanding
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {data.partial}
          </div>
          <div className="text-[11px] text-white/30 mt-1">
            partial payment{data.partial !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Breakdown bar */}
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-3">
            Split
          </div>
          {data.revenue > 0 ? (
            <>
              <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-2">
                <div
                  className="bg-[#FFB800] rounded-full transition-all"
                  style={{
                    width: `${Math.round((data.cashRev / data.revenue) * 100)}%`,
                  }}
                />
                <div className="bg-blue-400 rounded-full flex-1 transition-all" />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-[#FFB800]">
                  {Math.round((data.cashRev / data.revenue) * 100)}% Cash
                </span>
                <span className="text-blue-400">
                  {Math.round((data.onlineRev / data.revenue) * 100)}% Online
                </span>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-white/20">No payments yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Log Payment Modal ────────────────────────────────────────────────────────

interface LogPaymentModalProps {
  onClose: () => void;
  onLogged: () => void;
}

function LogPaymentModal({ onClose, onLogged }: LogPaymentModalProps) {
  const { showToast } = useToastStore();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const [type, setType] = useState<"new_member" | "renewal" | "manual">(
    "manual",
  );
  const [notes, setNotes] = useState("");
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const PLAN_PRICES: Record<string, number> = {
    Monthly: 800,
    Quarterly: 2100,
    Annual: 7500,
    Student: 500,
  };

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await memberService.getAll({
          search: search.trim(),
          limit: 5,
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

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!selected) {
      setErrorMsg("Please select a member.");
      return;
    }
    setLoading(true);
    try {
      const res = await paymentService.create({
        gymId: selected.gymId,
        method,
        type,
        amountPaid: amountPaidInput ? Number(amountPaidInput) : undefined,
        notes: notes.trim() || undefined,
      });
      showToast(res.message, "success");
      onLogged();
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setErrorMsg(err.response?.data?.message || "Failed to log payment.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <>
      <style>{`@keyframes payFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }`}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}>
        <div
          className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl"
          style={{ animation: "payFadeIn 0.2s ease" }}
          onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#FF6B1A] mb-0.5">
                Log Payment
              </div>
              <div className="text-white font-bold text-base">
                Record a Payment
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white flex items-center justify-center text-sm cursor-pointer">
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Member search */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Member <span className="text-[#FF6B1A]">*</span>
              </label>
              {selected ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-[#FF6B1A]/5 border border-[#FF6B1A]/20 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {selected.name}
                    </div>
                    <div className="text-xs text-white/40">
                      {selected.gymId} · {selected.plan} · ₱
                      {PLAN_PRICES[selected.plan]?.toLocaleString()}
                    </div>
                    {selected.balance > 0 && (
                      <div className="text-xs text-amber-400 mt-0.5">
                        ⚠ Outstanding: ₱{selected.balance.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelected(null);
                      setSearch("");
                    }}
                    className="text-white/30 hover:text-white text-xs cursor-pointer">
                    ✕
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or GYM-ID..."
                    autoFocus
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">
                      ...
                    </div>
                  )}
                  {results.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#2a2a2a] border border-white/10 rounded-lg overflow-hidden z-10">
                      {results.map((m) => (
                        <button
                          key={m.gymId}
                          onClick={() => {
                            setSelected(m);
                            setSearch("");
                            setResults([]);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-0 text-left cursor-pointer">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white truncate">
                              {m.name}
                            </div>
                            <div className="text-xs text-white/30">
                              {m.gymId} · {m.plan}
                            </div>
                          </div>
                          <span className="text-xs font-mono text-[#FFB800]">
                            ₱{PLAN_PRICES[m.plan]?.toLocaleString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["cash", "online"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`py-2.5 rounded-lg border text-sm font-bold uppercase tracking-wide transition-all cursor-pointer ${
                      method === m
                        ? m === "cash"
                          ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]"
                          : "border-blue-400 bg-blue-400/10 text-blue-400"
                        : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"
                    }`}>
                    {m === "cash" ? "💵 Cash" : "🏦 Online"}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment type */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["new_member", "renewal", "manual"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all cursor-pointer ${
                      type === t
                        ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]"
                        : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"
                    }`}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Notes <span className="text-white/20">(optional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Paid via GCash ref #12345"
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
              />
            </div>

            {/* Partial payment — custom amount */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Amount Paid{" "}
                <span className="text-white/20">
                  (leave blank for full payment)
                </span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-mono">
                  ₱
                </span>
                <input
                  type="number"
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                  placeholder="Leave blank for full amount"
                  min={1}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                />
              </div>
            </div>

            {/* Amount preview */}
            {selected && (
              <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/10 rounded-lg">
                <div>
                  <span className="text-xs text-white/40">Amount to log</span>
                  {amountPaidInput &&
                    Number(amountPaidInput) <
                      (PLAN_PRICES[selected.plan] ?? 0) && (
                      <div className="text-[10px] text-amber-400 mt-0.5">
                        Partial — ₱
                        {Math.max(
                          0,
                          (PLAN_PRICES[selected.plan] ?? 0) -
                            Number(amountPaidInput),
                        ).toLocaleString()}{" "}
                        remaining
                      </div>
                    )}
                </div>
                <span className="text-lg font-bold font-mono text-[#FFB800]">
                  ₱
                  {(amountPaidInput
                    ? Math.min(
                        Number(amountPaidInput),
                        PLAN_PRICES[selected.plan] ?? 0,
                      )
                    : (PLAN_PRICES[selected.plan] ?? 0)
                  ).toLocaleString()}
                </span>
              </div>
            )}

            {errorMsg && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-xs">{errorMsg}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !selected}
                className="flex-1 py-2.5 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 cursor-pointer">
                {loading ? "Logging..." : "Log Payment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { showToast } = useToastStore();

  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPartial, setFilterPartial] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 10;

  const [showLogModal, setShowLogModal] = useState(false);

  // ── Fetch summary ──────────────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await paymentService.getSummary();
      setSummary(res);
    } catch {
      showToast("Failed to load payment summary.", "error");
    } finally {
      setSummaryLoading(false);
    }
  }, [showToast]);

  // ── Fetch payments list ────────────────────────────────────────────────────
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await paymentService.getAll({
        search: search.trim() || undefined,
        method: filterMethod || undefined,
        type: filterType || undefined,
        partial: filterPartial ? "true" : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        page,
        limit: LIMIT,
      });
      setPayments(res.payments);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }, [search, filterMethod, filterType, filterPartial, fromDate, toDate, page]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const id = setTimeout(fetchPayments, search ? 400 : 0);
    return () => clearTimeout(id);
  }, [fetchPayments, search]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => {
      fetchSummary();
      fetchPayments();
    }, 60000);
    return () => clearInterval(id);
  }, [fetchSummary, fetchPayments]);

  useEffect(() => {
    setPage(1);
  }, [search, filterMethod, filterType, filterPartial, fromDate, toDate]);

  const handleLogged = () => {
    fetchSummary();
    fetchPayments();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-5"
        style={{ animation: "fadeIn 0.2s ease" }}>
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Payments</h2>
            <p className="text-xs text-white/30 mt-0.5">
              Membership payments — cash and online
              {summary?.withBalance ? (
                <span className="ml-2 text-amber-400">
                  · {summary.withBalance} member
                  {summary.withBalance !== 1 ? "s" : ""} with outstanding
                  balance
                  {summary.today?.outstanding > 0 && (
                    <>
                      {" "}
                      · ₱{summary.today.outstanding.toLocaleString()} owed today
                    </>
                  )}
                </span>
              ) : null}
            </p>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer">
            <span className="text-base leading-none">+</span>
            Log Payment
          </button>
        </div>

        {/* ── Summary ── */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white/[0.02] border border-white/10 rounded-xl p-4 h-24 animate-pulse"
              />
            ))}
          </div>
        ) : summary ? (
          <SummarySection summary={summary} />
        ) : null}

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2">
          {/* Date shortcuts */}
          <div className="flex gap-1">
            {(["Today", "This Week", "This Month"] as const).map((label) => {
              const getManilaDate = (offsetDays = 0) => {
                const d = new Date();
                d.setDate(d.getDate() - offsetDays);
                return new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Asia/Manila",
                }).format(d);
              };
              const ranges: Record<string, { from: string; to: string }> = {
                Today: { from: getManilaDate(), to: getManilaDate() },
                "This Week": (() => {
                  const now = new Date();
                  const dow = [
                    "Sun",
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                  ].indexOf(
                    now.toLocaleDateString("en-US", {
                      timeZone: "Asia/Manila",
                      weekday: "short",
                    }),
                  );
                  const mondayOffset = (dow + 6) % 7;
                  return {
                    from: getManilaDate(mondayOffset),
                    to: getManilaDate(),
                  };
                })(),
                "This Month": {
                  from: new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Manila",
                  }).format(
                    new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      1,
                    ),
                  ),
                  to: getManilaDate(),
                },
              };
              const r = ranges[label];
              const isActive = fromDate === r.from && toDate === r.to;
              return (
                <button
                  key={label}
                  onClick={() => {
                    setFromDate(r.from);
                    setToDate(r.to);
                  }}
                  className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide rounded-lg border transition-all cursor-pointer ${isActive ? "bg-[#FF6B1A]/15 text-[#FF6B1A] border-[#FF6B1A]/30" : "bg-[#212121] text-white/30 border-white/10 hover:text-white/60 hover:border-white/20"}`}>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30"
              width="14"
              height="14"
              viewBox="0 0 18 18"
              fill="none">
              <circle
                cx="8"
                cy="8"
                r="5.5"
                stroke="#FF6B1A"
                strokeWidth="1.5"
              />
              <path
                d="M12.5 12.5L16 16"
                stroke="#FF6B1A"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or GYM-ID..."
              className="w-full bg-[#212121] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {/* Method filter */}
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
            style={{ colorScheme: "dark" }}>
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="online">Online</option>
          </select>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
            style={{ colorScheme: "dark" }}>
            <option value="">All Types</option>
            <option value="new_member">New Member</option>
            <option value="renewal">Renewal</option>
            <option value="manual">Manual</option>
            <option value="balance_settlement">Settlement</option>
          </select>

          {/* Outstanding balance filter */}
          <button
            onClick={() => setFilterPartial((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
              filterPartial
                ? "bg-amber-400/15 text-amber-400 border-amber-400/30"
                : "bg-[#212121] text-white/40 border-white/10 hover:text-white hover:border-white/20"
            }`}>
            <span>⚠</span>
            Outstanding
          </button>

          {/* Date range */}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
            style={{ colorScheme: "dark" }}
            placeholder="From"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-[#212121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
            style={{ colorScheme: "dark" }}
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="px-3 py-2.5 text-xs text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer">
              Clear dates
            </button>
          )}
          {(search ||
            filterMethod ||
            filterType ||
            filterPartial ||
            fromDate ||
            toDate) && (
            <button
              onClick={() => {
                setSearch("");
                setFilterMethod("");
                setFilterType("");
                setFilterPartial(false);
                setFromDate("");
                setToDate("");
              }}
              className="px-3 py-2.5 text-xs text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-lg transition-all cursor-pointer">
              Clear all
            </button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-white/10">
            {[
              "Member",
              "Plan",
              "Amount",
              "Method",
              "Type",
              "Balance",
              "Processed By",
            ].map((h) => (
              <div
                key={h}
                className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {h}
              </div>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
                    <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="px-5 py-10 text-center">
              <div className="text-red-400 text-sm mb-2">{error}</div>
              <button
                onClick={fetchPayments}
                className="text-xs text-[#FF6B1A] hover:underline cursor-pointer">
                Try again
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && payments.length === 0 && (
            <div className="px-5 py-16 text-center">
              <div className="text-4xl mb-3 opacity-20">◈</div>
              <div className="text-white/30 text-sm font-semibold">
                No payments found
              </div>
              <div className="text-white/20 text-xs mt-1">
                {search || filterMethod || filterType
                  ? "Try adjusting your filters"
                  : "Payments will appear here when members are registered"}
              </div>
            </div>
          )}

          {/* Rows */}
          {!loading &&
            !error &&
            payments.map((p) => (
              <div
                key={p._id}
                className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 md:gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                {/* Member */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
                    {p.memberName
                      .split(" ")
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {p.memberName}
                    </div>
                    <div className="text-[10px] text-white/30 font-mono">
                      {p.gymId} · {formatDate(p.createdAt)}{" "}
                      {formatTime(p.createdAt)}
                    </div>
                  </div>
                </div>

                {/* Plan */}
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Plan
                  </span>
                  <span className="text-xs font-semibold text-white/60">
                    {p.plan}
                  </span>
                </div>

                {/* Amount */}
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Amount
                  </span>
                  <div>
                    <div className="text-sm font-mono font-bold text-[#FFB800]">
                      ₱{(p.amountPaid ?? p.amount).toLocaleString()}
                    </div>
                    {p.isPartial && p.totalAmount > 0 && (
                      <div className="text-[10px] text-white/30 font-mono">
                        of ₱{p.totalAmount.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Method */}
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Method
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${METHOD_COLORS[p.method]}`}>
                    {p.method === "online" ? "Online" : "Cash"}
                  </span>
                </div>

                {/* Type */}
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Type
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${TYPE_COLORS[p.type]}`}>
                    {TYPE_LABELS[p.type]}
                  </span>
                </div>

                {/* Balance */}
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Balance
                  </span>
                  {p.type === "balance_settlement" ? (
                    p.balance > 0 ? (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                        ₱{p.balance.toLocaleString()} left
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
                        Settled ✓
                      </span>
                    )
                  ) : p.isPartial ? (
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                      ₱{p.balance.toLocaleString()} owed
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/20">
                      Paid in full
                    </span>
                  )}
                </div>

                {/* Processed by */}
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    By
                  </span>
                  <span className="text-xs text-white/40 truncate">
                    {p.processedBy?.name ?? "—"}
                  </span>
                </div>
              </div>
            ))}

          {/* Footer */}
          {!loading && payments.length > 0 && (
            <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-white/30">
                {total} record{total !== 1 ? "s" : ""}
              </span>
              <span className="text-sm font-mono font-bold text-[#FFB800]">
                Page total: ₱
                {payments
                  .reduce((s, p) => s + (p.amountPaid ?? p.amount), 0)
                  .toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log payment modal */}
      {showLogModal && (
        <LogPaymentModal
          onClose={() => setShowLogModal(false)}
          onLogged={handleLogged}
        />
      )}
    </>
  );
}
