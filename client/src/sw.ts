/**
 * sw.ts
 * GMS -- Service Worker
 *
 * Cache strategies:
 *   App shell               -> Cache First (precached by Workbox)
 *   GET /api/members        -> Network First, 10s timeout, fallback to cache
 *   GET /api/walkin/today   -> Network First, 8s timeout, fallback to cache
 *   GET /api/auth/gym-info  -> Cache First (rarely changes)
 *   All other requests      -> Network only
 *
 * POST/PATCH are NOT intercepted -- offlineQueue.ts handles those.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// TypedSW -- minimal interface for the SW methods we use.
// Avoids needing lib.webworker.d.ts which conflicts with the DOM lib in tsconfig.
interface TypedSW {
  addEventListener(type: string, listener: (event: Event) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}

const sw = self as unknown as TypedSW;

// IMPORTANT: Workbox scans compiled output for the literal "self.__WB_MANIFEST"
// to inject the precache manifest. Must use (self as any) so TypeScript
// doesn't rename it -- using sw.__WB_MANIFEST would compile to _sw.__WB_MANIFEST
// which Workbox cannot find.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
precacheAndRoute((self as any).__WB_MANIFEST);
cleanupOutdatedCaches();

// Cache names
const MEMBERS_CACHE = "gms-members-v1";
const WALKINS_CACHE = "gms-walkins-v1";
const GYM_INFO_CACHE = "gms-gym-info-v1";

// Members list -- Network First
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/members") &&
    !url.pathname.includes("/checkin") &&
    !url.pathname.includes("/checkout"),
  new NetworkFirst({
    cacheName: MEMBERS_CACHE,
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 }),
    ],
  }),
  "GET",
);

// Walk-ins today -- Network First
registerRoute(
  ({ url }) =>
    url.pathname.includes("/api/walkin") &&
    (url.pathname.includes("/today") || url.searchParams.get("date") !== null),
  new NetworkFirst({
    cacheName: WALKINS_CACHE,
    networkTimeoutSeconds: 8,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 30 * 60 }),
    ],
  }),
  "GET",
);

// Gym info -- Cache First
registerRoute(
  ({ url }) => url.pathname.includes("/api/auth/gym-info"),
  new CacheFirst({
    cacheName: GYM_INFO_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
  "GET",
);

// Auth + payments -- Network Only, never cache
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/auth/login") ||
    url.pathname.startsWith("/api/payments"),
  new NetworkOnly(),
);

// Skip waiting -- activate new SW immediately
sw.addEventListener("message", (event: Event) => {
  const data = (event as MessageEvent).data as { type?: string };
  if (data?.type === "SKIP_WAITING") {
    void sw.skipWaiting();
  }
});

sw.addEventListener("activate", (event: Event) => {
  const e = event as Event & { waitUntil(p: Promise<void>): void };
  e.waitUntil(sw.clients.claim());
});
