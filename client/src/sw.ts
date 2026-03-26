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
 * IMPORTANT: Routes use url.href.includes() not url.pathname.
 * API calls go to a different origin (ironcore-gms-server.onrender.com).
 * Workbox only intercepts cross-origin requests when matched via full href.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

interface TypedSW {
  addEventListener(type: string, listener: (event: Event) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}

const sw = self as unknown as TypedSW;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
precacheAndRoute((self as any).__WB_MANIFEST);
cleanupOutdatedCaches();

const MEMBERS_CACHE = "gms-members-v1";
const WALKINS_CACHE = "gms-walkins-v1";
const GYM_INFO_CACHE = "gms-gym-info-v1";

// Members list -- Network First (cross-origin safe via href)
registerRoute(
  ({ url }) =>
    url.href.includes("/api/members") &&
    !url.href.includes("/checkin") &&
    !url.href.includes("/checkout") &&
    !url.href.includes("/stats") &&
    !url.href.includes("/at-risk"),
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

// Walk-ins today -- Network First (cross-origin safe via href)
registerRoute(
  ({ url }) =>
    url.href.includes("/api/walkin") &&
    (url.href.includes("/today") || url.searchParams.get("date") !== null),
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

// Gym info -- Cache First (cross-origin safe via href)
registerRoute(
  ({ url }) => url.href.includes("/api/auth/gym-info"),
  new CacheFirst({
    cacheName: GYM_INFO_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  }),
  "GET",
);

// Auth + payments -- Network Only
registerRoute(
  ({ url }) =>
    url.href.includes("/api/auth/login") || url.href.includes("/api/payments"),
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
