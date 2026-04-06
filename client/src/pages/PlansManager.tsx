/**
 * PlansManager.tsx
 * LakasGMS — Plan Management Component
 *
 * Drop this into your SettingsPage to let the owner:
 *   - View all plans (active + inactive)
 *   - Edit price and duration of any plan
 *   - Add custom plans (e.g. "Summer Promo")
 *   - Toggle plans active/inactive
 *   - Delete custom plans (default plans can only be deactivated)
 *
 * Reads from and writes to: GET/POST/PATCH/DELETE /api/auth/plans
 * Updates gymStore after every mutation so all pages stay in sync.
 */

import { useState, useEffect, useCallback } from "react";
import { useGymStore, type GymPlan } from "../store/gymStore";
import { useToastStore } from "../store/toastStore";
import api from "../services/api";

// ─── API helpers ──────────────────────────────────────────────────────────────

const planApi = {
  getAll: async (): Promise<GymPlan[]> => {
    const res = await api.get("/auth/plans");
    return res.data.plans;
  },
  add: async (payload: {
    name: string;
    price: number;
    durationMonths: number;
  }): Promise<{ message: string; plans: GymPlan[] }> => {
    const res = await api.post("/auth/plans", payload);
    return res.data;
  },
  update: async (
    planId: string,
    payload: {
      name?: string;
      price?: number;
      durationMonths?: number;
      isActive?: boolean;
    },
  ): Promise<{ message: string; plans: GymPlan[] }> => {
    const res = await api.patch(`/auth/plans/${planId}`, payload);
    return res.data;
  },
  remove: async (
    planId: string,
  ): Promise<{ message: string; plans: GymPlan[] }> => {
    const res = await api.delete(`/auth/plans/${planId}`);
    return res.data;
  },
};

// ─── Add Plan Modal ───────────────────────────────────────────────────────────

function AddPlanModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (plans: GymPlan[]) => void;
}) {
  const { showToast } = useToastStore();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    setError("");
    if (!name.trim() || name.trim().length < 2) {
      setError("Plan name must be at least 2 characters.");
      return;
    }
    if (!price || Number(price) < 0) {
      setError("Price must be zero or positive.");
      return;
    }
    if (!duration || Number(duration) < 1 || Number(duration) > 24) {
      setError("Duration must be 1-24 months.");
      return;
    }
    setSaving(true);
    try {
      const res = await planApi.add({
        name: name.trim(),
        price: Number(price),
        durationMonths: Number(duration),
      });
      showToast(res.message, "success");
      onAdded(res.plans);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to add plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-xl p-6 shadow-2xl"
        style={{
          transform: "translate(-50%, -50%)",
          animation: "fadeScaleIn 0.2s ease",
        }}
      >
        <div className="text-xs font-semibold uppercase tracking-widest text-[#FF6B1A] mb-1">
          New Plan
        </div>
        <div className="text-white font-bold text-base mb-5">
          Add a membership plan
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Plan Name <span className="text-[#FF6B1A]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Promo"
              maxLength={30}
              autoFocus
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Price <span className="text-[#FF6B1A]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-mono">
                ₱
              </span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                min={0}
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Duration (months) <span className="text-[#FF6B1A]">*</span>
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min={1}
              max={24}
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-white/10 text-white/40 hover:text-white text-sm font-semibold rounded-lg transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex-1 py-2.5 bg-[#FF6B1A] text-black text-sm font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "Adding..." : "Add Plan"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Edit Plan Row ────────────────────────────────────────────────────────────

function PlanRow({
  plan,
  onUpdated,
}: {
  plan: GymPlan;
  onUpdated: (plans: GymPlan[]) => void;
}) {
  const { showToast } = useToastStore();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(plan.price));
  const [duration, setDuration] = useState(String(plan.durationMonths));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await planApi.update(plan._id, {
        price: Number(price),
        durationMonths: Number(duration),
      });
      showToast(res.message, "success");
      onUpdated(res.plans);
      setEditing(false);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Update failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      const res = await planApi.update(plan._id, {
        isActive: !plan.isActive,
      });
      showToast(res.message, "success");
      onUpdated(res.plans);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Toggle failed.", "error");
    }
  };

  const handleDelete = async () => {
    try {
      const res = await planApi.remove(plan._id);
      showToast(res.message, "success");
      onUpdated(res.plans);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Delete failed.", "error");
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        plan.isActive
          ? "bg-[#2a2a2a] border-white/10"
          : "bg-white/[0.02] border-white/5 opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Plan info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">
              {plan.name}
            </span>
            {plan.isDefault && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-white/30 uppercase tracking-wide">
                Default
              </span>
            )}
            {!plan.isActive && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 uppercase tracking-wide">
                Inactive
              </span>
            )}
          </div>
          {!editing ? (
            <div className="text-xs text-white/40 mt-0.5">
              ₱{plan.price.toLocaleString()} · {plan.durationMonths} month
              {plan.durationMonths !== 1 ? "s" : ""}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-xs font-mono">
                  ₱
                </span>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min={0}
                  className="w-28 bg-[#1e1e1e] border border-white/10 rounded-lg pl-6 pr-2 py-1.5 text-xs text-white outline-none focus:border-[#FF6B1A] transition-colors"
                />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min={1}
                  max={24}
                  className="w-16 bg-[#1e1e1e] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-[#FF6B1A] transition-colors text-center"
                />
                <span className="text-[10px] text-white/30">mo</span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-[#FF6B1A] text-black text-[10px] font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {saving ? "..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setPrice(String(plan.price));
                  setDuration(String(plan.durationMonths));
                }}
                className="px-2 py-1.5 text-white/30 hover:text-white text-[10px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        {!editing && (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Edit */}
            <button
              onClick={() => setEditing(true)}
              title="Edit price & duration"
              className="p-1.5 text-white/40 hover:text-blue-400 border border-white/10 hover:border-blue-400/40 rounded-md transition-all cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>

            {/* Toggle active */}
            <button
              onClick={handleToggleActive}
              title={plan.isActive ? "Deactivate plan" : "Activate plan"}
              className={`p-1.5 border rounded-md transition-all cursor-pointer ${
                plan.isActive
                  ? "text-amber-400/60 hover:text-amber-400 border-amber-400/20 hover:border-amber-400/40"
                  : "text-emerald-400/60 hover:text-emerald-400 border-emerald-400/20 hover:border-emerald-400/40"
              }`}
            >
              {plan.isActive ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            {/* Delete — only for non-default plans */}
            {!plan.isDefault && (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete plan"
                className="p-1.5 text-red-400/40 hover:text-red-400 border border-red-400/10 hover:border-red-400/40 rounded-md transition-all cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3">
          <span className="text-xs text-red-400 flex-1">
            Delete "{plan.name}" permanently?
          </span>
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-3 py-1.5 text-white/40 hover:text-white text-xs font-semibold border border-white/10 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-400 transition-all cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlansManager() {
  const { setPlans } = useGymStore();
  const [allPlans, setAllPlans] = useState<GymPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchPlans = useCallback(async () => {
    try {
      const plans = await planApi.getAll();
      setAllPlans(plans);
      setPlans(plans); // sync gymStore
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [setPlans]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handlePlansChanged = (plans: GymPlan[]) => {
    setAllPlans(plans);
    setPlans(plans); // sync gymStore so all pages update immediately
  };

  const activePlans = allPlans.filter((p) => p.isActive);
  const inactivePlans = allPlans.filter((p) => !p.isActive);

  return (
    <>
      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Membership Plans</h3>
            <p className="text-[11px] text-white/30 mt-0.5">
              {activePlans.length} active plan
              {activePlans.length !== 1 ? "s" : ""}
              {inactivePlans.length > 0 && (
                <span className="ml-1 text-white/20">
                  · {inactivePlans.length} inactive
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-sm leading-none">+</span>
            Add Plan
          </button>
        </div>

        {/* Plans list */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 bg-white/5 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : allPlans.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-3xl mb-2 opacity-20">◉</div>
            <div className="text-white/30 text-sm">No plans configured</div>
            <div className="text-white/20 text-xs mt-1">
              Click "Add Plan" to create your first membership plan
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Active plans first */}
            {activePlans.map((plan) => (
              <PlanRow
                key={plan._id}
                plan={plan}
                onUpdated={handlePlansChanged}
              />
            ))}
            {/* Inactive plans */}
            {inactivePlans.length > 0 && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/20 pt-2">
                  Inactive
                </div>
                {inactivePlans.map((plan) => (
                  <PlanRow
                    key={plan._id}
                    plan={plan}
                    onUpdated={handlePlansChanged}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add Plan Modal */}
      {showAddModal && (
        <AddPlanModal
          onClose={() => setShowAddModal(false)}
          onAdded={handlePlansChanged}
        />
      )}
    </>
  );
}
