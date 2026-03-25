/**
 * PaymentsPage.tsx
 *
 * Modal fix: search results render inline (not absolutely positioned)
 * so they push content down naturally without breaking layout.
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { paymentService } from "../services/paymentService";
import { memberService } from "../services/memberService";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
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
  const cashPct =
    data.revenue > 0 ? Math.round((data.cashRev / data.revenue) * 100) : 0;
  const onlinePct = data.revenue > 0 ? 100 - cashPct : 0;

  return (
    <div className="bg-[#212121] border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
          Revenue Overview
        </div>
        <div className="flex gap-1 bg-[#2a2a2a] rounded-lg p-0.5">
          {(["today", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setActive(p)}
              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wide rounded-md transition-all cursor-pointer ${active === p ? "bg-[#FF6B1A]/20 text-[#FF6B1A]" : "text-white/30 hover:text-white/60"}`}
            >
              {p === "today"
                ? "Today"
                : p === "week"
                  ? "This Week"
                  : "This Month"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 bg-[#FF6B1A]/5 border border-t-2 border-[#FF6B1A]/20 border-t-[#FF6B1A] rounded-xl p-4">
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
        <div className="bg-amber-400/5 border border-t-2 border-amber-400/20 border-t-amber-400 rounded-xl p-4">
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
        <div className="bg-white/[0.02] border border-t-2 border-white/10 border-t-white/20 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-3">
            Split
          </div>
          {data.revenue > 0 ? (
            <>
              <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-3">
                <div
                  className="bg-[#FFB800] rounded-full transition-all"
                  style={{ width: `${cashPct}%` }}
                />
                <div className="bg-blue-400 rounded-full flex-1 transition-all" />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-[#FFB800] font-semibold">
                  {cashPct}% Cash
                </span>
                <span className="text-blue-400 font-semibold">
                  {onlinePct}% Online
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
  const { getActivePlans, getPlanPrice, getPlanDuration } = useGymStore();
  const activePlans = getActivePlans();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [method, setMethod] = useState<"cash" | "online">("cash");
  const [notes, setNotes] = useState("");
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [renewExpiry, setRenewExpiry] = useState(false);

  const handleSelectMember = (m: Member) => {
    setSelected(m);
    setSelectedPlan(m.plan);
    setSearch("");
    setResults([]);
    setAmountPaidInput("");
    const daysLeft = Math.ceil(
      (new Date(m.expiresAt).getTime() - Date.now()) / 86400000,
    );
    setRenewExpiry(m.status === "expired" || daysLeft <= 7);
  };

  const handlePlanChange = (plan: string) => {
    setSelectedPlan(plan);
    setAmountPaidInput("");
  };

  const getNewExpiry = (plan: string): string => {
    const months = getPlanDuration(plan);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split("T")[0];
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
    if (amountPaidInput) {
      const parsed = Number(amountPaidInput);
      if (isNaN(parsed) || parsed <= 0) {
        setErrorMsg("Amount must be greater than zero.");
        return;
      }
    }
    setLoading(true);
    try {
      const planPrice = getPlanPrice(selectedPlan);
      const isPlanChange = selectedPlan !== selected.plan;
      const res = await paymentService.create({
        gymId: selected.gymId,
        method,
        type: "manual",
        amountPaid: amountPaidInput ? Number(amountPaidInput) : undefined,
        totalAmount: planPrice,
        notes: notes.trim() || undefined,
        plan: isPlanChange || renewExpiry ? selectedPlan : undefined,
        renewExpiry: renewExpiry || undefined,
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

  const planPrice = selected ? getPlanPrice(selectedPlan) : 0;
  const isPlanChange = selected ? selectedPlan !== selected.plan : false;
  const daysLeft = selected
    ? Math.ceil(
        (new Date(selected.expiresAt).getTime() - Date.now()) / 86400000,
      )
    : 0;

  return createPortal(
    <>
      <style>{`@keyframes payFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }`}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl flex flex-col"
          style={{ animation: "payFadeIn 0.2s ease", maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — fixed */}
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
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
              className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white flex items-center justify-center text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Member search */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                Member <span className="text-[#FF6B1A]">*</span>
              </label>

              {selected ? (
                <div className="px-4 py-3 bg-[#FF6B1A]/5 border border-[#FF6B1A]/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {selected.name}
                      </div>
                      <div className="text-xs text-white/40">
                        {selected.gymId} · {selected.plan}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelected(null);
                        setSelectedPlan("");
                        setSearch("");
                        setRenewExpiry(false);
                      }}
                      className="text-white/30 hover:text-white text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                    <div className="flex-1">
                      <div className="text-[10px] text-white/30 uppercase tracking-widest">
                        Expires
                      </div>
                      <div
                        className={`text-xs font-mono mt-0.5 ${daysLeft < 0 ? "text-red-400" : daysLeft <= 7 ? "text-amber-400" : "text-white/50"}`}
                      >
                        {new Date(selected.expiresAt).toLocaleDateString(
                          "en-PH",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                        {daysLeft < 0 && (
                          <span className="ml-1.5 text-red-400">
                            ({Math.abs(daysLeft)}d overdue)
                          </span>
                        )}
                        {daysLeft >= 0 && daysLeft <= 7 && (
                          <span className="ml-1.5 text-amber-400">
                            ({daysLeft}d left)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-white/30 uppercase tracking-widest">
                        Status
                      </div>
                      <div
                        className={`text-xs font-semibold mt-0.5 ${selected.status === "active" ? "text-emerald-400" : selected.status === "expired" ? "text-red-400" : "text-amber-400"}`}
                      >
                        {selected.status}
                      </div>
                    </div>
                    {selected.balance > 0 && (
                      <div className="flex-1">
                        <div className="text-[10px] text-white/30 uppercase tracking-widest">
                          Owed
                        </div>
                        <div className="text-xs font-mono font-semibold text-amber-400 mt-0.5">
                          ₱{selected.balance.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // FIX: search input + results are in normal document flow
                // Results render as an inline block below the input — no absolute positioning
                <div>
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
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Inline results — part of normal flow, no absolute positioning */}
                  {results.length > 0 && (
                    <div className="mt-1 bg-[#2a2a2a] border border-white/10 rounded-lg overflow-hidden">
                      {results.map((m) => {
                        const dl = Math.ceil(
                          (new Date(m.expiresAt).getTime() - Date.now()) /
                            86400000,
                        );
                        return (
                          <button
                            key={m.gymId}
                            onClick={() => handleSelectMember(m)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 text-left cursor-pointer transition-colors"
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
                              <div className="text-sm font-semibold text-white truncate">
                                {m.name}
                              </div>
                              <div className="text-xs text-white/30">
                                {m.gymId} · {m.plan}
                                {dl < 0 && (
                                  <span className="ml-1 text-red-400">
                                    expired
                                  </span>
                                )}
                                {dl >= 0 && dl <= 7 && (
                                  <span className="ml-1 text-amber-400">
                                    {dl}d left
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-mono text-[#FFB800] shrink-0">
                              ₱{getPlanPrice(m.plan).toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* No results state */}
                  {!searching && search.trim() && results.length === 0 && (
                    <div className="mt-1 px-4 py-3 bg-[#2a2a2a] border border-white/10 rounded-lg text-xs text-white/30 text-center">
                      No member found for "{search}"
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Plan selector */}
            {selected && activePlans.length > 0 && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Plan{" "}
                  {isPlanChange && (
                    <span className="text-[#FF6B1A] normal-case">
                      (changing from {selected.plan})
                    </span>
                  )}
                </label>
                <div
                  className="grid gap-1.5"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(activePlans.length, 4)}, 1fr)`,
                  }}
                >
                  {activePlans.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => handlePlanChange(p.name)}
                      className={`py-2 rounded-lg border text-center transition-all cursor-pointer ${selectedPlan === p.name ? "border-[#FF6B1A] bg-[#FF6B1A]/10 text-[#FF6B1A]" : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"}`}
                    >
                      <div className="text-[10px] font-bold uppercase truncate px-1">
                        {p.name}
                      </div>
                      <div className="text-[10px] font-mono mt-0.5 opacity-70">
                        ₱{p.price.toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Extend expiry toggle */}
            {selected && (
              <div
                onClick={() => setRenewExpiry(!renewExpiry)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${renewExpiry ? "bg-emerald-400/5 border-emerald-400/30" : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}
              >
                <div
                  className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${renewExpiry ? "bg-emerald-400" : "bg-white/10"}`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${renewExpiry ? "left-[18px]" : "left-0.5"}`}
                  />
                </div>
                <div className="flex-1">
                  <div
                    className={`text-xs font-semibold ${renewExpiry ? "text-emerald-400" : "text-white/40"}`}
                  >
                    Extend membership
                  </div>
                  <div className="text-[10px] text-white/30 mt-0.5">
                    {renewExpiry
                      ? `New expiry: ${new Date(getNewExpiry(selectedPlan)).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} (+${getPlanDuration(selectedPlan)}mo)`
                      : "Toggle to renew/extend the membership with this payment"}
                  </div>
                </div>
              </div>
            )}

            {/* Method */}
            {selected && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["cash", "online"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`py-2.5 rounded-lg border text-sm font-bold uppercase tracking-wide transition-all cursor-pointer ${method === m ? (m === "cash" ? "border-[#FFB800] bg-[#FFB800]/10 text-[#FFB800]" : "border-blue-400 bg-blue-400/10 text-blue-400") : "border-white/10 bg-[#2a2a2a] text-white/30 hover:border-white/20"}`}
                    >
                      {m === "cash" ? "💵 Cash" : "🏦 Online"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Amount */}
            {selected && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                  Amount Paid{" "}
                  <span className="text-white/20">
                    (leave blank for full ₱{planPrice.toLocaleString()})
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
                    placeholder={planPrice.toLocaleString()}
                    min={1}
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Amount preview */}
            {selected && (
              <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/10 rounded-lg">
                <div>
                  <span className="text-xs text-white/40">Amount to log</span>
                  {amountPaidInput &&
                    Number(amountPaidInput) > 0 &&
                    Number(amountPaidInput) < planPrice && (
                      <div className="text-[10px] text-amber-400 mt-0.5">
                        Partial — ₱
                        {Math.max(
                          0,
                          planPrice - Number(amountPaidInput),
                        ).toLocaleString()}{" "}
                        remaining
                      </div>
                    )}
                  {amountPaidInput && Number(amountPaidInput) > planPrice && (
                    <div className="text-[10px] text-amber-400 mt-0.5">
                      Capped at plan price ₱{planPrice.toLocaleString()}
                    </div>
                  )}
                </div>
                <span className="text-lg font-bold font-mono text-[#FFB800]">
                  ₱
                  {(amountPaidInput && Number(amountPaidInput) > 0
                    ? Math.min(Number(amountPaidInput), planPrice)
                    : planPrice
                  ).toLocaleString()}
                </span>
              </div>
            )}

            {/* Notes */}
            {selected && (
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
            )}

            {errorMsg && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-xs">{errorMsg}</p>
              </div>
            )}
          </div>

          {/* Footer — fixed */}
          <div className="px-6 py-4 border-t border-white/10 flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !selected}
              className="flex-1 py-2.5 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {loading
                ? "Processing..."
                : renewExpiry
                  ? isPlanChange
                    ? "Pay & Switch Plan"
                    : "Pay & Renew"
                  : "Log Payment"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface PaymentsPageProps {
  forceStaffView?: boolean;
}

export default function PaymentsPage({
  forceStaffView = false,
}: PaymentsPageProps = {}) {
  const { showToast } = useToastStore();
  const isStaff = forceStaffView;

  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const todayManila = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
  }).format(new Date());

  const [search, setSearch] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPartial, setFilterPartial] = useState(false);
  const [fromDate, setFromDate] = useState(isStaff ? todayManila : "");
  const [toDate, setToDate] = useState(isStaff ? todayManila : "");
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(
    isStaff ? "Today" : null,
  );
  const [page, setPage] = useState(1);
  const LIMIT = 10;
  const [showLogModal, setShowLogModal] = useState(false);

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
      setGrandTotal(
        res.grandTotal ??
          res.payments.reduce(
            (s: number, p: Payment) => s + (p.amountPaid ?? p.amount),
            0,
          ),
      );
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

  const hasFilters = isStaff
    ? !!(search || filterMethod || filterType || filterPartial)
    : !!(
        search ||
        filterMethod ||
        filterType ||
        filterPartial ||
        fromDate ||
        toDate
      );

  const clearAllFilters = () => {
    setSearch("");
    setFilterMethod("");
    setFilterType("");
    setFilterPartial(false);
    if (!isStaff) {
      setFromDate("");
      setToDate("");
      setActiveDatePreset(null);
    }
  };

  const getManilaDate = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
      d,
    );
  };

  const DATE_RANGES = {
    Today: { from: getManilaDate(), to: getManilaDate() },
    "This Week": (() => {
      const now = new Date();
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        now.toLocaleDateString("en-US", {
          timeZone: "Asia/Manila",
          weekday: "short",
        }),
      );
      return { from: getManilaDate((dow + 6) % 7), to: getManilaDate() };
    })(),
    "This Month": {
      from: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
      }).format(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      to: getManilaDate(),
    },
  };

  const pageTotal = payments.reduce(
    (s, p) => s + (p.amountPaid ?? p.amount),
    0,
  );

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .payment-row:nth-child(even) { background: rgba(255,255,255,0.012); }
        .payment-row:hover { background: rgba(255,107,26,0.04) !important; }
      `}</style>

      <div
        className="max-w-7xl mx-auto pb-24 lg:pb-6 space-y-5"
        style={{ animation: "fadeIn 0.2s ease" }}
      >
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Payments</h2>
            <p className="text-xs text-white/30 mt-0.5">
              {isStaff
                ? "Today's payments — log and settle"
                : "Membership payments — cash and online"}
              {summary?.withBalance ? (
                <span className="ml-2 text-amber-400">
                  · {summary.withBalance} member
                  {summary.withBalance !== 1 ? "s" : ""} with outstanding
                  balance
                </span>
              ) : null}
            </p>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            Log Payment
          </button>
        </div>

        {/* ── Summary — owner only ── */}
        {!isStaff &&
          (summaryLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white/[0.02] border border-white/10 rounded-xl p-4 h-24 animate-pulse"
                />
              ))}
            </div>
          ) : summary ? (
            <SummarySection summary={summary} />
          ) : null)}

        {/* ── Filters ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30"
                width="14"
                height="14"
                viewBox="0 0 18 18"
                fill="none"
              >
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
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
              />
            </div>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
              style={{ colorScheme: "dark" }}
            >
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
              style={{ colorScheme: "dark" }}
            >
              <option value="">All Types</option>
              <option value="new_member">New Member</option>
              <option value="renewal">Renewal</option>
              <option value="manual">Manual</option>
              <option value="balance_settlement">Settlement</option>
            </select>
            <button
              onClick={() => setFilterPartial((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${filterPartial ? "bg-amber-400/15 text-amber-400 border-amber-400/30" : "bg-[#2a2a2a] text-white/40 border-white/10 hover:text-white hover:border-white/20"}`}
            >
              <div
                className={`w-2 h-2 rounded-full transition-colors ${filterPartial ? "bg-amber-400" : "bg-white/20"}`}
              />
              Outstanding only
            </button>
            {hasFilters && (
              <button
                onClick={clearAllFilters}
                className="px-3 py-2.5 text-xs text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-lg transition-all cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {!isStaff && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">
                Date:
              </span>
              {(
                Object.entries(DATE_RANGES) as [
                  string,
                  { from: string; to: string },
                ][]
              ).map(([label, r]) => (
                <button
                  key={label}
                  onClick={() => {
                    setFromDate(r.from);
                    setToDate(r.to);
                    setActiveDatePreset(label);
                  }}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg border transition-all cursor-pointer ${activeDatePreset === label ? "bg-[#FF6B1A]/15 text-[#FF6B1A] border-[#FF6B1A]/30" : "bg-[#2a2a2a] text-white/30 border-white/10 hover:text-white/60 hover:border-white/20"}`}
                >
                  {label}
                </button>
              ))}
              <div className="w-px h-5 bg-white/10" />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setActiveDatePreset(null);
                  }}
                  className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
                  style={{ colorScheme: "dark" }}
                />
                <span className="text-white/20 text-xs">→</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setActiveDatePreset(null);
                  }}
                  className="bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 outline-none focus:border-[#FF6B1A] transition-colors cursor-pointer"
                  style={{ colorScheme: "dark" }}
                />
                {(fromDate || toDate) && (
                  <button
                    onClick={() => {
                      setFromDate("");
                      setToDate("");
                      setActiveDatePreset(null);
                    }}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
          <div className="hidden md:grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-white/10 bg-white/[0.02]">
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
                className="text-[10px] font-semibold uppercase tracking-widest text-white/30"
              >
                {h}
              </div>
            ))}
          </div>

          {loading && (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
                    <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="px-5 py-10 text-center">
              <div className="text-red-400 text-sm mb-2">{error}</div>
              <button
                onClick={fetchPayments}
                className="text-xs text-[#FF6B1A] hover:underline cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && payments.length === 0 && (
            <div className="px-5 py-16 text-center">
              <div className="text-4xl mb-3 opacity-20">◈</div>
              <div className="text-white/30 text-sm font-semibold">
                No payments found
              </div>
              <div className="text-white/20 text-xs mt-1">
                {hasFilters
                  ? "Try adjusting your filters"
                  : "Payments will appear here when members are registered"}
              </div>
            </div>
          )}

          {!loading &&
            !error &&
            payments.map((p) => (
              <div
                key={p._id}
                className="payment-row grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 md:gap-4 px-5 py-4 border-b border-white/5 last:border-0 transition-colors cursor-default"
              >
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
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Plan
                  </span>
                  <span className="text-xs font-semibold text-white/60">
                    {p.plan}
                  </span>
                </div>
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
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Method
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${METHOD_COLORS[p.method]}`}
                  >
                    {p.method === "online" ? "Online" : "Cash"}
                  </span>
                </div>
                <div className="flex md:items-center">
                  <span className="text-xs text-white/40 md:hidden mr-2 w-20 shrink-0">
                    Type
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${TYPE_COLORS[p.type]}`}
                  >
                    {TYPE_LABELS[p.type]}
                  </span>
                </div>
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

          {!loading && payments.length > 0 && (
            <div className="px-5 py-4 border-t border-white/10 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-xs text-white/30">
                {total} record{total !== 1 ? "s" : ""}
                {hasFilters && (
                  <span className="ml-1 text-[#FF6B1A]/60">(filtered)</span>
                )}
              </span>
              {!isStaff && (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[10px] text-white/25 uppercase tracking-widest">
                      Page total
                    </div>
                    <div className="text-sm font-mono font-bold text-white/60">
                      ₱{pageTotal.toLocaleString()}
                    </div>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="text-right">
                    <div className="text-[10px] text-white/25 uppercase tracking-widest">
                      {hasFilters ? "Filtered total" : "Grand total"}
                    </div>
                    <div className="text-lg font-mono font-bold text-[#FFB800]">
                      ₱{grandTotal.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1,
                )
                .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - (arr[idx - 1] as number) > 1)
                    acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-2 py-1.5 text-xs text-white/20"
                    >
                      ···
                    </span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${page === n ? "bg-[#FF6B1A]/15 text-[#FF6B1A] border-[#FF6B1A]/30" : "border-white/10 text-white/40 hover:text-white hover:border-white/20"}`}
                    >
                      {n}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {showLogModal && (
        <LogPaymentModal
          onClose={() => setShowLogModal(false)}
          onLogged={handleLogged}
        />
      )}
    </>
  );
}
