/**
 * offlineQueue.ts
 * GMS — Offline Action Queue
 *
 * Stores pending write actions in IndexedDB when the device is offline.
 * Actions survive tab closes, page refreshes, and app restarts.
 *
 * Queue entry shape:
 *   { id, url, method, body, timestamp, retries, status }
 *
 * Status flow:
 *   pending → syncing → done (removed) | failed (kept for review)
 *
 * Usage:
 *   await offlineQueue.enqueue({ url, method, body })
 *   await offlineQueue.getAll()
 *   await offlineQueue.markSyncing(id)
 *   await offlineQueue.remove(id)
 *   await offlineQueue.markFailed(id)
 *   await offlineQueue.incrementRetry(id)
 *   await offlineQueue.clearFailed()
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueueStatus = "pending" | "syncing" | "failed";

export interface QueueEntry {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: Record<string, unknown>;
  timestamp: number; // Date.now() when action was queued
  retries: number; // how many sync attempts have been made
  status: QueueStatus;
  label: string; // human-readable label e.g. "Check-in: Juan Dela Cruz"
  token: string; // JWT token at time of queuing — captured before logout
}

export type EnqueuePayload = Pick<
  QueueEntry,
  "url" | "method" | "body" | "label" | "token"
>;

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = "gms-offline";
const DB_VERSION = 1;
const STORE_NAME = "queue";

// ─── DB Init ──────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        // Index by timestamp for ordered draining
        store.createIndex("timestamp", "timestamp", { unique: false });
        // Index by status for fast pending/failed lookups
        store.createIndex("status", "status", { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const offlineQueue = {
  /**
   * Add a new action to the queue.
   * Called when a write fails due to no internet.
   */
  enqueue: async (payload: EnqueuePayload): Promise<QueueEntry> => {
    const db = await openDB();
    const entry: QueueEntry = {
      id: generateId(),
      url: payload.url,
      method: payload.method,
      body: payload.body,
      timestamp: Date.now(),
      retries: 0,
      status: "pending",
      label: payload.label,
      token: payload.token,
    };
    await promisify(tx(db, "readwrite").add(entry));
    return entry;
  },

  /**
   * Get all entries ordered by timestamp (oldest first).
   * Used by syncManager to drain in chronological order.
   */
  getAll: async (): Promise<QueueEntry[]> => {
    const db = await openDB();
    const store = tx(db, "readonly");
    const index = store.index("timestamp");
    return promisify(index.getAll() as IDBRequest<QueueEntry[]>);
  },

  /**
   * Get only pending entries (not failed, not syncing).
   */
  getPending: async (): Promise<QueueEntry[]> => {
    const db = await openDB();
    const store = tx(db, "readonly");
    const index = store.index("status");
    const all = await promisify(
      index.getAll(IDBKeyRange.only("pending")) as IDBRequest<QueueEntry[]>,
    );
    return all.sort((a, b) => a.timestamp - b.timestamp);
  },

  /**
   * Get failed entries — shown in the badge detail panel.
   */
  getFailed: async (): Promise<QueueEntry[]> => {
    const db = await openDB();
    const store = tx(db, "readonly");
    const index = store.index("status");
    return promisify(
      index.getAll(IDBKeyRange.only("failed")) as IDBRequest<QueueEntry[]>,
    );
  },

  /**
   * Count pending + syncing entries — drives the badge number.
   */
  countPending: async (): Promise<number> => {
    const db = await openDB();
    const store = tx(db, "readonly");
    const idxStatus = store.index("status");
    const [pending, syncing] = await Promise.all([
      promisify(idxStatus.count(IDBKeyRange.only("pending"))),
      promisify(idxStatus.count(IDBKeyRange.only("syncing"))),
    ]);
    return pending + syncing;
  },

  /**
   * Count failed entries — drives the red badge.
   */
  countFailed: async (): Promise<number> => {
    const db = await openDB();
    const store = tx(db, "readonly");
    const index = store.index("status");
    return promisify(index.count(IDBKeyRange.only("failed")));
  },

  /**
   * Mark an entry as currently being synced.
   * Prevents double-processing if sync runs concurrently.
   */
  markSyncing: async (id: string): Promise<void> => {
    const db = await openDB();
    const store = tx(db, "readwrite");
    const entry = await promisify(store.get(id) as IDBRequest<QueueEntry>);
    if (!entry) return;
    entry.status = "syncing";
    await promisify(store.put(entry));
  },

  /**
   * Remove a successfully synced entry from the queue.
   */
  remove: async (id: string): Promise<void> => {
    const db = await openDB();
    await promisify(tx(db, "readwrite").delete(id));
  },

  /**
   * Increment retry count on an entry.
   * Called after each failed sync attempt.
   */
  incrementRetry: async (id: string): Promise<number> => {
    const db = await openDB();
    const store = tx(db, "readwrite");
    const entry = await promisify(store.get(id) as IDBRequest<QueueEntry>);
    if (!entry) return 0;
    entry.retries += 1;
    entry.status = "pending"; // reset from syncing back to pending for retry
    await promisify(store.put(entry));
    return entry.retries;
  },

  /**
   * Mark an entry as permanently failed (after 3 retries).
   * Kept in the queue for staff to review, not retried again.
   */
  markFailed: async (id: string): Promise<void> => {
    const db = await openDB();
    const store = tx(db, "readwrite");
    const entry = await promisify(store.get(id) as IDBRequest<QueueEntry>);
    if (!entry) return;
    entry.status = "failed";
    await promisify(store.put(entry));
  },

  /**
   * Clear all failed entries — staff manually dismisses them.
   */
  clearFailed: async (): Promise<void> => {
    const db = await openDB();
    const store = tx(db, "readwrite");
    const index = store.index("status");
    const failed = await promisify(
      index.getAllKeys(IDBKeyRange.only("failed")) as IDBRequest<IDBValidKey[]>,
    );
    await Promise.all(
      failed.map((key) => promisify(tx(db, "readwrite").delete(key))),
    );
  },

  /**
   * Clear everything — used for testing or reset.
   */
  clearAll: async (): Promise<void> => {
    const db = await openDB();
    await promisify(tx(db, "readwrite").clear());
  },
};
