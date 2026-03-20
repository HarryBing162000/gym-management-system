/**
 * StaffPage.tsx
 * IronCore GMS — Staff Management (Owner only)
 *
 * Lets the owner view, add, deactivate, and reactivate staff accounts.
 */

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { staffService, type StaffMember } from "../services/staffService";
import { useToastStore } from "../store/toastStore";

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffPage, setStaffPage] = useState(1);
  const STAFF_LIMIT = 10;
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    id: string;
    username: string;
    action: "deactivate" | "reactivate";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await staffService.getAll();
      setStaff(data);
    } catch {
      showToast("Failed to load staff", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (!confirmState) return;
    try {
      setActionLoading(true);
      if (confirmState.action === "deactivate") {
        await staffService.deactivate(confirmState.id);
        showToast(`@${confirmState.username} has been deactivated`, "success");
      } else {
        await staffService.reactivate(confirmState.id);
        showToast(`@${confirmState.username} has been reactivated`, "success");
      }
      await load();
    } catch {
      showToast("Action failed. Please try again.", "error");
    } finally {
      setActionLoading(false);
      setConfirmState(null);
    }
  };

  const activeCount = staff.filter((s) => s.isActive).length;
  const inactiveCount = staff.length - activeCount;

  return (
    <div className="space-y-5 pb-24 lg:pb-6 max-w-4xl mx-auto">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            Staff Management
          </h2>
          <p className="text-xs text-white/30 mt-0.5">
            {staff.length} account{staff.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-green-400">{activeCount} active</span>
            {inactiveCount > 0 && (
              <span className="text-zinc-500"> · {inactiveCount} inactive</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#FF6B1A] text-black text-xs font-bold rounded-lg hover:bg-[#ff8a45] transition-all active:scale-95 self-start sm:self-auto">
          <span>+</span> Add Staff
        </button>
      </div>

      {/* ── TABLE ── */}
      <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-white/20 text-sm">
            Loading staff...
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-16 text-white/20">
            <div className="text-4xl mb-3">◎</div>
            <div className="text-sm font-semibold">No staff accounts yet</div>
            <div className="text-xs mt-1 text-white/15">
              Click "Add Staff" to create one
            </div>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/30 text-left">
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest">
                    Staff
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest hidden sm:table-cell">
                    Date Added
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest">
                    Status
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff
                  .slice((staffPage - 1) * STAFF_LIMIT, staffPage * STAFF_LIMIT)
                  .map((s) => (
                    <tr
                      key={s._id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
                      {/* Staff name + username */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/10 flex items-center justify-center text-[#FF6B1A] text-xs font-bold shrink-0">
                            {s.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="text-white font-semibold text-xs">
                              {s.name}
                            </div>
                            <div className="text-white/30 text-[11px] font-mono">
                              @{s.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date added */}
                      <td className="px-5 py-4 text-white/30 text-xs hidden sm:table-cell">
                        {new Date(s.createdAt).toLocaleDateString("en-PH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>

                      {/* Status badge */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            s.isActive
                              ? "bg-green-400/10 text-green-400 border border-green-400/20"
                              : "bg-white/5 text-white/30 border border-white/10"
                          }`}>
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${s.isActive ? "bg-green-400" : "bg-white/20"}`}
                          />
                          {s.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Action button */}
                      <td className="px-5 py-4 text-right">
                        {s.isActive ? (
                          <button
                            onClick={() =>
                              setConfirmState({
                                id: s._id,
                                username: s.username,
                                action: "deactivate",
                              })
                            }
                            className="text-[10px] font-bold text-red-400 border border-red-400/20 hover:bg-red-400/10 px-3 py-1.5 rounded-lg transition-all">
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              setConfirmState({
                                id: s._id,
                                username: s.username,
                                action: "reactivate",
                              })
                            }
                            className="text-[10px] font-bold text-green-400 border border-green-400/20 hover:bg-green-400/10 px-3 py-1.5 rounded-lg transition-all">
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {/* Pagination */}
            {staff.length > STAFF_LIMIT && (
              <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] text-white/30">
                  {(staffPage - 1) * STAFF_LIMIT + 1}–
                  {Math.min(staffPage * STAFF_LIMIT, staff.length)} of{" "}
                  {staff.length}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setStaffPage((p) => Math.max(1, p - 1))}
                    disabled={staffPage === 1}
                    className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                    ←
                  </button>
                  <button
                    onClick={() =>
                      setStaffPage((p) =>
                        Math.min(Math.ceil(staff.length / STAFF_LIMIT), p + 1),
                      )
                    }
                    disabled={
                      staffPage === Math.ceil(staff.length / STAFF_LIMIT)
                    }
                    className="px-2.5 py-1 text-[10px] border border-white/10 text-white/40 hover:text-white hover:border-white/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                    →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── ADD STAFF MODAL ── */}
      {showAddModal && (
        <AddStaffModal
          onClose={() => setShowAddModal(false)}
          onCreated={load}
        />
      )}

      {/* ── CONFIRM MODAL ── */}
      {confirmState &&
        createPortal(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-full max-w-sm">
              <h2 className="text-white font-bold text-base mb-1">
                {confirmState.action === "deactivate"
                  ? "Deactivate Staff"
                  : "Reactivate Staff"}
              </h2>
              <p className="text-white/40 text-sm mb-6">
                {confirmState.action === "deactivate"
                  ? `@${confirmState.username} will lose access to the system immediately.`
                  : `@${confirmState.username} will be able to log in again.`}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmState(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-white/50 hover:bg-white/5 transition-colors text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleToggle}
                  disabled={actionLoading}
                  className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-bold transition-colors disabled:opacity-50 ${
                    confirmState.action === "deactivate"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}>
                  {actionLoading
                    ? "Please wait..."
                    : confirmState.action === "deactivate"
                      ? "Yes, Deactivate"
                      : "Yes, Reactivate"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── ADD STAFF MODAL ────────────────────────────────────────────────────────────

function AddStaffModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const handleSubmit = async () => {
    if (!name.trim() || !username.trim() || !password.trim()) {
      showToast("All fields are required", "error");
      return;
    }
    if (password.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }
    try {
      setSubmitting(true);
      await staffService.create({
        name: name.trim(),
        username: username.trim(),
        password,
        role: "staff",
      });
      showToast(`Staff @${username.trim()} created successfully`, "success");
      onCreated();
      onClose();
    } catch (err: unknown) {
      showToast(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to create staff account",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-white font-bold text-base mb-5">
          Add Staff Account
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-white/40 text-[10px] font-semibold uppercase tracking-widest mb-1.5 block">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Juan dela Cruz"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#FF6B1A]/60 transition-colors"
            />
          </div>
          <div>
            <label className="text-white/40 text-[10px] font-semibold uppercase tracking-widest mb-1.5 block">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. staff_juan"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#FF6B1A]/60 transition-colors font-mono"
            />
            <p className="text-white/20 text-[10px] mt-1">
              Letters, numbers, and underscores only
            </p>
          </div>
          <div>
            <label className="text-white/40 text-[10px] font-semibold uppercase tracking-widest mb-1.5 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#FF6B1A]/60 transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-white/50 hover:bg-white/5 transition-colors text-sm">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 px-4 py-2 rounded-lg bg-[#FF6B1A] hover:bg-[#ff8a45] disabled:opacity-50 text-black text-sm font-bold transition-colors">
            {submitting ? "Creating..." : "Create Staff"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
