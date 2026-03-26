/**
 * syncManager.ts
 * GMS — Background Sync Manager
 *
 * Watches navigator.onLine. When internet restores, drains the offline
 * queue in chronological order. Retries each action up to MAX_RETRIES
 * times before marking it permanently failed.
 *
 * Usage:
 *   syncManager.init()  — call once in App.tsx on mount
 *   syncManager.sync()  — call manually to trigger a sync attempt
 *   syncManager.subscribe(cb) — listen for state changes (badge updates)
 */

import { offlineQueue } from "./offlineQueue";
import type { QueueEntry } from "./offlineQueue";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // 2s between retries
const SYNC_DEBOUNCE_MS = 1000; // wait 1s after online event before syncing

// ─── State ────────────────────────────────────────────────────────────────────

export interface SyncState {
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
  lastSyncAt: number | null; // timestamp of last successful full sync
}

type SyncListener = (state: SyncState) => void;

let _state: SyncState = {
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  lastSyncAt: null,
};

const _listeners = new Set<SyncListener>();
let _syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _initialized = false;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function setState(partial: Partial<SyncState>) {
  _state = { ..._state, ...partial };
  _listeners.forEach((cb) => cb(_state));
}

async function refreshCounts() {
  const [pendingCount, failedCount] = await Promise.all([
    offlineQueue.countPending(),
    offlineQueue.countFailed(),
  ]);
  setState({ pendingCount, failedCount });
}

async function sendEntry(entry: QueueEntry): Promise<boolean> {
  try {
    const API_BASE = import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL}/api`
      : "http://localhost:5000/api";

    const res = await fetch(`${API_BASE}${entry.url}`, {
      method: entry.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${entry.token}`,
      },
      body: JSON.stringify(entry.body),
    });

    // 2xx = success. 4xx = permanent failure (bad data) — don't retry.
    // 5xx = transient — retry.
    if (res.ok) return true;
    if (res.status >= 400 && res.status < 500) {
      // Client error (400, 409 conflict etc) — permanent failure, no retry
      console.warn(
        `[syncManager] Permanent failure ${res.status} for ${entry.url}`,
      );
      return false;
    }
    // 5xx — transient, should retry
    return false;
  } catch {
    // Network error — should retry
    return false;
  }
}

async function processEntry(
  entry: QueueEntry,
): Promise<"success" | "retry" | "failed"> {
  await offlineQueue.markSyncing(entry.id);
  const ok = await sendEntry(entry);

  if (ok) {
    await offlineQueue.remove(entry.id);
    return "success";
  }

  const newRetries = await offlineQueue.incrementRetry(entry.id);

  if (newRetries >= MAX_RETRIES) {
    await offlineQueue.markFailed(entry.id);
    return "failed";
  }

  return "retry";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const syncManager = {
  /**
   * Initialize the sync manager. Call once in App.tsx.
   * Sets up online/offline event listeners.
   */
  init: () => {
    if (_initialized || typeof window === "undefined") return;
    _initialized = true;

    // Set initial online state
    setState({ isOnline: navigator.onLine });

    // Listen for network changes
    window.addEventListener("online", () => {
      setState({ isOnline: true });

      // Debounce — wait a moment for connection to stabilize
      if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
      _syncDebounceTimer = setTimeout(() => {
        syncManager.sync();
      }, SYNC_DEBOUNCE_MS);
    });

    window.addEventListener("offline", () => {
      setState({ isOnline: false });
      if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
    });

    // Refresh counts on init (queue may have entries from previous session)
    refreshCounts();

    // Attempt sync on init if already online (handles page refresh while offline)
    if (navigator.onLine) {
      setTimeout(() => syncManager.sync(), 500);
    }
  },

  /**
   * Manually trigger a sync attempt.
   * Safe to call multiple times — won't double-process.
   */
  sync: async (): Promise<void> => {
    if (_state.isSyncing || !_state.isOnline) return;

    const pending = await offlineQueue.getPending();
    if (pending.length === 0) {
      await refreshCounts();
      return;
    }

    setState({ isSyncing: true });
    await refreshCounts();

    let successCount = 0;
    let failedCount = 0;

    for (const entry of pending) {
      // Double-check still online between entries
      if (!navigator.onLine) break;

      const result = await processEntry(entry);

      if (result === "success") {
        successCount++;
      } else if (result === "failed") {
        failedCount++;
      } else {
        // retry — add small delay before next attempt
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      // Refresh counts after each entry so badge updates live
      await refreshCounts();
    }

    setState({
      isSyncing: false,
      lastSyncAt: successCount > 0 ? Date.now() : _state.lastSyncAt,
    });

    await refreshCounts();

    // Fire events for toast notifications
    if (successCount > 0) {
      window.dispatchEvent(
        new CustomEvent("gms:sync-complete", {
          detail: { successCount, failedCount },
        }),
      );
    }
    if (failedCount > 0) {
      window.dispatchEvent(
        new CustomEvent("gms:sync-failed", {
          detail: { failedCount },
        }),
      );
    }
  },

  /**
   * Subscribe to state changes — used by SyncBadge component.
   * Returns an unsubscribe function.
   */
  subscribe: (cb: SyncListener): (() => void) => {
    _listeners.add(cb);
    cb(_state); // immediately emit current state to new subscriber
    return () => _listeners.delete(cb);
  },

  /**
   * Get current state snapshot without subscribing.
   */
  getState: (): SyncState => ({ ..._state }),

  /**
   * Enqueue an action to be synced later.
   * Call this when a write fails due to offline.
   */
  enqueue: async (
    payload: Omit<Parameters<typeof offlineQueue.enqueue>[0], never>,
  ) => {
    const entry = await offlineQueue.enqueue(payload);
    await refreshCounts();
    return entry;
  },

  /**
   * Dismiss all failed entries — staff has reviewed them.
   */
  clearFailed: async (): Promise<void> => {
    await offlineQueue.clearFailed();
    await refreshCounts();
  },

  /**
   * Refresh badge counts manually (call after any direct queue operation).
   */
  refreshCounts,
};
