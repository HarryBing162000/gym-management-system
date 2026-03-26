/**
 * syncManager.ts
 * GMS -- Background Sync Manager
 */

import { offlineQueue } from "./offlineQueue";
import type { QueueEntry } from "./offlineQueue";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const SYNC_DEBOUNCE_MS = 1000;

export interface SyncState {
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
  lastSyncAt: number | null;
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

async function sendEntry(entry: QueueEntry): Promise<boolean | "duplicate"> {
  try {
    const API_BASE = import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL}/api`
      : "http://localhost:5000/api";

    const res = await fetch(`${API_BASE}${entry.url}`, {
      method: entry.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${entry.token}`,
      },
      body: JSON.stringify(entry.body),
    });

    if (res.ok) return true;

    // Log actual error for debugging
    let errorBody = "";
    try {
      const json = await res.json();
      errorBody = json.message ?? JSON.stringify(json);
    } catch {
      errorBody = await res.text().catch(() => "");
    }
    console.warn(
      `[syncManager] Sync failed ${res.status} for ${entry.url}: ${errorBody}`,
    );

    // 409 Conflict = already exists -- remove from queue, fire duplicate event
    if (res.status === 409) {
      window.dispatchEvent(
        new CustomEvent("gms:sync-duplicate", {
          detail: { label: entry.label },
        }),
      );
      return "duplicate";
    }

    // Other 4xx = bad data, permanent failure
    if (res.status >= 400 && res.status < 500) return false;

    // 5xx = transient, retry
    return false;
  } catch {
    return false;
  }
}

async function processEntry(
  entry: QueueEntry,
): Promise<"success" | "retry" | "failed" | "duplicate"> {
  await offlineQueue.markSyncing(entry.id);
  const ok = await sendEntry(entry);

  if (ok === true) {
    await offlineQueue.remove(entry.id);
    return "success";
  }

  if (ok === "duplicate") {
    await offlineQueue.remove(entry.id);
    return "duplicate";
  }

  const newRetries = await offlineQueue.incrementRetry(entry.id);
  if (newRetries >= MAX_RETRIES) {
    await offlineQueue.markFailed(entry.id);
    return "failed";
  }
  return "retry";
}

export const syncManager = {
  init: () => {
    if (_initialized || typeof window === "undefined") return;
    _initialized = true;

    setState({ isOnline: navigator.onLine });

    window.addEventListener("online", () => {
      setState({ isOnline: true });
      if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
      _syncDebounceTimer = setTimeout(
        () => syncManager.sync(),
        SYNC_DEBOUNCE_MS,
      );
    });

    window.addEventListener("offline", () => {
      setState({ isOnline: false });
      if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
    });

    refreshCounts();

    if (navigator.onLine) {
      setTimeout(() => syncManager.sync(), 500);
    }
  },

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
      if (!navigator.onLine) break;

      const result = await processEntry(entry);

      if (result === "success") {
        successCount++;
      } else if (result === "duplicate") {
        // Removed from queue, gms:sync-duplicate event already fired
        // Do NOT count as success -- no "synced successfully" toast
      } else if (result === "failed") {
        failedCount++;
      } else {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      await refreshCounts();
    }

    setState({
      isSyncing: false,
      lastSyncAt: successCount > 0 ? Date.now() : _state.lastSyncAt,
    });

    await refreshCounts();

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

  subscribe: (cb: SyncListener): (() => void) => {
    _listeners.add(cb);
    cb(_state);
    return () => _listeners.delete(cb);
  },

  getState: (): SyncState => ({ ..._state }),

  enqueue: async (
    payload: Omit<Parameters<typeof offlineQueue.enqueue>[0], never>,
  ) => {
    const entry = await offlineQueue.enqueue(payload);
    await refreshCounts();
    return entry;
  },

  clearFailed: async (): Promise<void> => {
    await offlineQueue.clearFailed();
    await refreshCounts();
  },

  refreshCounts,
};
