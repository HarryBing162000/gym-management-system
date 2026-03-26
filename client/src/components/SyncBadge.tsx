/**
 * SyncBadge.tsx
 * GMS -- Offline Sync Status Badge
 *
 * Mounts in OwnerLayout and StaffLayout topbars.
 * Font and design matches system conventions:
 *   - text-xs / text-[10px] for labels
 *   - font-mono for IDs and codes
 *   - font-semibold for headings
 *   - Cyber Orange #FF6B1A for primary actions
 *   - Same border/bg patterns as other modals
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { syncManager } from "../lib/syncManager";
import { offlineQueue } from "../lib/offlineQueue";
import { useToastStore } from "../store/toastStore";
import type { SyncState } from "../lib/syncManager";
import type { QueueEntry } from "../lib/offlineQueue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function SyncPanel({
  onClose,
  failedEntries,
  pendingCount,
  isSyncing,
  isOnline,
  onClearFailed,
  onRetryNow,
}: {
  onClose: () => void;
  failedEntries: QueueEntry[];
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  onClearFailed: () => void;
  onRetryNow: () => void;
}) {
  return createPortal(
    <>
      <style>{`@keyframes syncFadeIn { from { opacity:0; transform:scale(0.95) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed top-14 right-4 z-50 w-72 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        style={{ animation: "syncFadeIn 0.15s ease" }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-red-400"}`}
              style={{
                animation: !isOnline ? "pulse-dot 1.5s infinite" : undefined,
              }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white text-xs cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {pendingCount === 0 && failedEntries.length === 0 ? (
            <div className="py-4 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                ✓ All actions synced
              </div>
            </div>
          ) : (
            <>
              {/* Pending */}
              {pendingCount > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
                    Pending sync — {pendingCount} action
                    {pendingCount !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-white/50">
                    {isSyncing
                      ? "Syncing now..."
                      : isOnline
                        ? "Will sync automatically"
                        : "Waiting for internet connection"}
                  </div>
                  {isOnline && !isSyncing && (
                    <button
                      onClick={onRetryNow}
                      className="mt-1.5 text-[10px] font-semibold text-[#FF6B1A] hover:text-[#ff8a45] cursor-pointer transition-colors"
                    >
                      Sync now →
                    </button>
                  )}
                </div>
              )}

              {/* Failed */}
              {failedEntries.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-1.5">
                    Failed — {failedEntries.length} action
                    {failedEntries.length !== 1 ? "s" : ""}
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {failedEntries.map((e) => (
                      <div
                        key={e.id}
                        className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2"
                      >
                        <div className="text-xs font-semibold text-white/70 truncate">
                          {e.label}
                        </div>
                        <div className="text-[10px] text-white/30 font-mono mt-0.5">
                          {timeAgo(e.timestamp)} · {e.retries} retries
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/30 mt-2">
                    Handle these manually at the front desk.
                  </p>
                  <button
                    onClick={onClearFailed}
                    className="mt-1 text-[10px] text-white/30 hover:text-white/60 cursor-pointer transition-colors"
                  >
                    Dismiss all failed →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Main Badge ───────────────────────────────────────────────────────────────

export default function SyncBadge() {
  const [syncState, setSyncState] = useState<SyncState>(syncManager.getState());
  const [open, setOpen] = useState(false);
  const [failedEntries, setFailedEntries] = useState<QueueEntry[]>([]);
  const { showToast } = useToastStore();

  useEffect(() => {
    const unsub = syncManager.subscribe(setSyncState);
    return unsub;
  }, []);

  useEffect(() => {
    if (open) {
      offlineQueue.getFailed().then(setFailedEntries);
    }
  }, [open, syncState.failedCount]);

  useEffect(() => {
    const onComplete = (e: Event) => {
      const { successCount } = (e as CustomEvent<{ successCount: number }>)
        .detail;
      showToast(
        `${successCount} offline action${successCount !== 1 ? "s" : ""} synced successfully.`,
        "success",
      );
    };

    const onFailed = (e: Event) => {
      const { failedCount } = (e as CustomEvent<{ failedCount: number }>)
        .detail;
      showToast(
        `${failedCount} action${failedCount !== 1 ? "s" : ""} failed to sync. Tap the sync badge for details.`,
        "error",
      );
    };

    window.addEventListener("gms:sync-complete", onComplete);
    window.addEventListener("gms:sync-failed", onFailed);
    return () => {
      window.removeEventListener("gms:sync-complete", onComplete);
      window.removeEventListener("gms:sync-failed", onFailed);
    };
  }, [showToast]);

  const { pendingCount, failedCount, isSyncing, isOnline } = syncState;
  const hasActivity = pendingCount > 0 || failedCount > 0 || !isOnline;

  if (!hasActivity) return null;

  const isError = failedCount > 0;
  const badgeCount = isError ? failedCount : pendingCount;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-semibold uppercase tracking-wide transition-all cursor-pointer ${
          isError
            ? "bg-red-500/10 border-red-500/25 text-red-400"
            : "bg-[#FF6B1A]/10 border-[#FF6B1A]/25 text-[#FF6B1A]"
        }`}
        title={
          isError
            ? `${failedCount} failed action${failedCount !== 1 ? "s" : ""}`
            : `${pendingCount} pending sync`
        }
      >
        {/* Status dot */}
        <span className={`relative flex h-1.5 w-1.5 shrink-0`}>
          {isSyncing && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isError ? "bg-red-400" : "bg-[#FF6B1A]"}`}
            />
          )}
          <span
            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isError ? "bg-red-400" : "bg-[#FF6B1A]"}`}
          />
        </span>

        {/* Label */}
        {isSyncing ? "Syncing" : `${badgeCount} pending`}
      </button>

      {open && (
        <SyncPanel
          onClose={() => setOpen(false)}
          failedEntries={failedEntries}
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          isOnline={isOnline}
          onClearFailed={async () => {
            await syncManager.clearFailed();
            setFailedEntries([]);
            setOpen(false);
          }}
          onRetryNow={() => {
            setOpen(false);
            syncManager.sync();
          }}
        />
      )}
    </>
  );
}
