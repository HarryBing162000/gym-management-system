# GMS Architecture Deep-Dive
## How the Gym Management System Actually Works

> This document is written for someone who wants to fully understand the system — not just what files exist, but *why* they exist, how they connect, and what happens step by step when anything occurs.

---

## Part 1 — The Big Mental Model

Before looking at any files, you need one mental model in your head:

```
Browser (React)  ←→  Node.js Server (Express)  ←→  MongoDB Atlas (Database)
```

The browser never talks to the database directly. It always goes through the server. The server is the gatekeeper — it checks who you are, what you're allowed to do, and then reads or writes the database.

**Three environments:**
- **Local dev** — browser at `localhost:5173`, server at `localhost:5000`, database on MongoDB Atlas
- **Production** — browser at `ironcore-gms.onrender.com`, server at `ironcore-gms-server.onrender.com`, same Atlas database
- **Kiosk** — browser at `/kiosk` route, same server, no login required
- **PWA preview** — browser at `localhost:4173`, production build, SW active, tests offline behavior

---

## Part 2 — How a Request Travels (The Full Journey)

Let's trace what happens when a staff member checks in a gym member. This single action touches 8 files.

### Step 1: Staff presses "Check In" button
**File:** `client/src/pages/StaffDashboard.tsx`

```
StaffDashboard → offlineCheckIn(gymId, memberName)
```

The component now calls the offline-aware wrapper, not `memberService.checkIn` directly.

### Step 2: offlineService decides online or offline
**File:** `client/src/lib/offlineService.ts`

```
if online → memberService.checkIn(gymId) → normal API call
if offline → syncManager.enqueue({ url, method, body, token }) → IndexedDB
```

### Step 3 (online path): Axios attaches the JWT token automatically
**File:** `client/src/services/api.ts`

```javascript
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### Step 4: Request hits the server router
**File:** `server/src/routes/memberRoutes.ts`

```
PATCH /api/members/:gymId/checkin → [protect middleware] → checkInMember controller
```

### Step 5: Middleware verifies the JWT
**File:** `server/src/middleware/authMiddleware.ts`

```javascript
const decoded = jwt.verify(token, process.env.JWT_SECRET);
req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
next();
```

### Step 6: Controller does the actual work
**File:** `server/src/controllers/memberController.ts`

```javascript
const member = await Member.findOne({ gymId });
member.checkedIn = true;
member.lastCheckIn = new Date();
await member.save();
await logAction({ action: 'check_in', ... });
return res.status(200).json({ success: true, ... });
```

### Step 7 (offline path): syncManager drains the queue when online
**File:** `client/src/lib/syncManager.ts`

```
navigator.onLine → true → drain IndexedDB queue in timestamp order
→ fetch(API_BASE + entry.url, { headers: { Authorization: Bearer token } })
→ success → remove from queue
→ 409 Conflict → duplicate detected → fire gms:sync-duplicate event → remove
→ fail 3x → mark as failed → show in red badge
```

### Step 8: UI updates optimistically
StaffDashboard flips `checkedIn: true` on the selected member **immediately** before the API call returns. This is the optimistic UI — staff don't wait for the network.

**That's the full round trip, both online and offline paths.**

---

## Part 3 — Authentication Deep-Dive

Authentication is the most important thing to understand. Everything else depends on it.

### How login works

```
LoginPage → authService.login(email, password)
         → POST /api/auth/login
         → authController finds User by email
         → bcrypt.compare(password, user.passwordHash)
         → jwt.sign({ id, role, name }, JWT_SECRET, { expiresIn: '7d' })
         → returns { token, user }
         → authStore.setAuth(user, token)
         → token stored in localStorage via Zustand persist
```

The JWT is a signed string containing `{ id, role, name }`. Nobody can fake a JWT without knowing the secret.

### Why name is in the JWT

`logAction()` needs the performer's name. If name wasn't in the JWT, every logged action would need a `User.findById()` call. Including name in the JWT payload saves a database round trip on every action.

### How logout works

```javascript
logout: () => {
  const { user, token } = get();  // grab BEFORE clearing
  if (user && token) {
    api.post('/action-logs/logout', {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {});  // fire-and-forget
  }
  set({ user: null, token: null, isAuthenticated: false });  // clear AFTER
}
```

If we cleared the token first, the logout log request would fail (401). So we grab the token, fire the log request, then clear state.

### Role-based access

Three roles: `owner`, `staff`, `member`. Members don't have User accounts — kiosk only. `protect` blocks unauthenticated. `requireRole()` blocks wrong roles.

---

## Part 4 — The Offline-First PWA System

This is the most complex part of the system. Five layers working together.

### Layer 1: Service Worker (`sw.ts`)

The Service Worker runs in a separate thread. It intercepts network requests and decides whether to serve from cache or go to the network.

**Cache strategies:**
- App shell (HTML/JS/CSS) → Cache First (precached by Workbox on deploy)
- `GET /api/members` → Network First, 10s timeout, falls back to cache
- `GET /api/walkin/today` → Network First, 8s timeout, falls back to cache
- `GET /api/auth/gym-info` → Cache First, 24h expiry
- Auth + payments → Network Only (never cache)

**Critical detail:** Route matchers use `url.href.includes()` not `url.pathname`. The API is on a different origin (`ironcore-gms-server.onrender.com`) so `url.pathname` only sees the path without the domain — it would never match cross-origin requests.

**TypeScript issue:** `self.__WB_MANIFEST` must stay as a literal string in the compiled output so Workbox can inject the precache manifest. Using `(self as any).__WB_MANIFEST` prevents TypeScript from renaming it during compilation.

### Layer 2: offlineQueue (`offlineQueue.ts`)

An IndexedDB wrapper that stores pending write actions. Actions survive tab closes, page refreshes, and app restarts.

```typescript
interface QueueEntry {
  id: string;
  url: string;          // e.g. "/members/GYM-1023/checkin"
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: Record<string, unknown>;
  timestamp: number;    // for chronological ordering
  retries: number;      // how many attempts made
  status: "pending" | "syncing" | "failed";
  label: string;        // human-readable: "Check-in: Juan Dela Cruz"
  token: string;        // JWT at time of queuing
}
```

Two indexes: `timestamp` (for ordered draining) and `status` (for fast pending/failed lookups).

### Layer 3: syncManager (`syncManager.ts`)

The brain of the offline system. Watches `navigator.onLine`. When internet restores:

1. Waits 1 second for connection to stabilize
2. Gets all pending entries ordered by timestamp
3. For each entry: marks as syncing → sends raw fetch → handles result
4. Result handling:
   - `200 OK` → remove from queue, count as success
   - `409 Conflict` → duplicate already exists → remove from queue, fire `gms:sync-duplicate` event (NOT counted as success, NOT shown as failure)
   - Other 4xx → permanent failure, increment retries
   - 5xx or network error → retry (max 3 times)
   - After 3 retries → mark as failed, keep in queue for staff review
5. After processing all: fire `gms:sync-complete` (if successes > 0) or `gms:sync-failed` (if failures > 0)

**Why 409 is special:** When a member is added offline, the first sync attempt creates it on the server. If the app retries (e.g. network dropped mid-response), the server returns 409 because the member already exists. This is not an error — it means the first attempt succeeded. Treating 409 as failure would confuse staff.

### Layer 4: offlineService (`offlineService.ts`)

Offline-aware wrappers for write actions. The UI calls these instead of `memberService` directly.

```typescript
// Example: offlineCheckIn
try {
  const res = await memberService.checkIn(gymId);  // try online
  return { success: true, queued: false, message: res.message };
} catch (err) {
  if (!isNetworkError(err)) throw err;  // real errors (401, 403) still propagate
  await syncManager.enqueue({ url, method, body, label, token });
  return { success: true, queued: true, message: "Queued for sync..." };
}
```

The caller gets `{ queued: true }` or `{ queued: false }` and shows different toast messages.

### Layer 5: SyncBadge (`SyncBadge.tsx`)

The UI indicator in the topbar. Subscribes to `syncManager` state changes and native `window` online/offline events.

**States:**
- Hidden — online + queue empty
- Amber "Offline" — offline, nothing queued yet
- Orange "X pending" — actions waiting to sync
- Spinning "Syncing" — sync in progress
- Red "X failed" — permanent failures need staff attention

**Custom events listened to:**
- `gms:sync-complete` → green toast "X offline actions synced"
- `gms:sync-failed` → red toast "X actions failed to sync"
- `gms:sync-duplicate` → amber warning toast "Juan Dela Cruz is already in the system"

---

## Part 5 — Walk-in System

Walk-ins are day visitors who pay per session instead of having a membership.

### The daily reset problem

Walk-in IDs are `WALK-001`, `WALK-002` etc. and reset every day. This means multiple days can have `WALK-001`. The `WalkIn` model uses a compound index `{ walkId: 1, date: 1 }` so queries always specify a date.

The reset logic: when registering a new walk-in, the controller queries for the highest `walkId` on today's date and increments. If no walk-ins exist today yet, starts at `WALK-001`.

### Pass types

Three types with different pricing from `Settings.walkInPrices`:
- Regular — single person
- Student — discounted with ID
- Couple — two people, single payment

All pricing comes from `Settings.walkInPrices` — never hardcoded.

### Dual checkout

Walk-ins can be checked out two ways:
1. Staff counter — through `WalkInDesk` in StaffDashboard
2. Public kiosk — through `KioskPage` by entering their `WALK-XXX` ID

Both call different routes but the same underlying logic.

---

## Part 6 — Payment System

### Payment types

| Type | When used |
|------|-----------|
| `new_member` | First payment when registering a member |
| `renewal` | Extending an existing membership |
| `manual` | Ad-hoc payment not tied to a specific period |
| `balance_settlement` | Paying off a partial payment balance |

### The expiry extension logic (critical — appears in 3 places)

When a payment renews a membership, the new expiry date is calculated:

```javascript
const now = new Date();
const currentExpiry = member.expiresAt ? new Date(member.expiresAt) : now;
const baseDate = currentExpiry > now ? new Date(currentExpiry) : new Date(now);
baseDate.setMonth(baseDate.getMonth() + months);
```

**This exact logic appears in three places and must stay in sync:**
1. `paymentController.ts` — server-side, what actually saves to DB
2. `PaymentsPage.tsx` `getNewExpiry()` — preview in payment modal
3. `OwnerDashboard.tsx` `calcNewExpiry()` — preview in RenewModal

If a member's plan expires Dec 31 and they renew on Jan 15 with a monthly plan, the new expiry is Feb 28 (one month from Dec 31), not Feb 15. Members never lose their remaining days.

### Partial payments and balance tracking

If a member pays ₱500 for a ₱800 plan:
- `amountPaid: 500`
- `totalAmount: 800`
- `balance: 300`
- `isPartial: true`

The ₱300 balance is stored on both the `Payment` record and `member.balance`. When settling, `settleBalance()` uses `member.balance` as `totalAmount` — not the plan price.

---

## Part 7 — Action Log System

Every staff/owner action gets logged to `ActionLog`. This creates a full audit trail.

### What gets logged

Every controller that mutates data calls `logAction()`:
- Login / logout
- Member created, updated, deactivated, reactivated
- Member checked in / checked out
- Walk-in registered / checked out
- Payment created / balance settled
- Settings updated

### Why it never crashes anything

```javascript
// logAction.ts
export async function logAction(params) {
  try {
    await ActionLog.create({ ... });
  } catch (err) {
    console.error('[logAction] Failed:', err);
    // never rethrows — the main operation already succeeded
  }
}
```

Logging failure is not a business failure. If MongoDB is slow or the ActionLog schema has a bug, the actual check-in still succeeds. Logging is always secondary.

### Role isolation

The `GET /api/action-logs` endpoint enforces:
- Owner → can see all logs, filter by any staff member
- Staff → can only see their own logs (server adds `performedBy.userId` filter, cannot be overridden by client)

---

## Part 8 — The Settings System

`Settings` is a single MongoDB document. There is only one. It is created on server startup if it doesn't exist, with default plans and walk-in prices.

```javascript
// index.ts — runs on startup
const existing = await Settings.findOne();
if (!existing) {
  await Settings.create({
    gymName: 'Gym Management System',
    plans: [{ name: 'Monthly', price: 800, durationMonths: 1, isActive: true }],
    walkInPrices: { regular: 150, student: 100, couple: 250 }
  });
}
```

### Why settings are cached per request

`paymentController.ts` might need settings 3-4 times during one payment (to get plan price, walk-in price, gym name for the log). Instead of calling `Settings.findOne()` each time:

```javascript
const settings = await Settings.findOne();  // once at top of controller
const price = getPlanPrice(plan, settings);  // pass settings to helpers
```

---

## Part 9 — How Pages Are Organized

### Owner navigation

`OwnerDashboard.tsx` uses `useSearchParams` to switch pages:

```
/dashboard               → shows DashboardContent
/dashboard?page=members  → shows MembersPage
/dashboard?page=payments → shows PaymentsPage
```

One URL, one component, multiple "pages" via query params. Browser back button works — each page visit adds to history.

### Staff navigation

`StaffDashboard.tsx` works the same way. Staff see:
- Check-in desk, Walk-in desk, Members (read-only), Payments (today only), My Activity

`forceStaffView={true}` is passed to `PaymentsPage` — same component, restricted data scope.

### Public kiosk

`KioskPage.tsx` at `/kiosk` — completely separate route, no layout, no auth. Uses raw `fetch()` with `X-Kiosk-Token` header instead of Axios.

---

## Part 10 — Security Layers

Every request passes through multiple security layers in order:

```
Request arrives
    ↓
1. Helmet — sets secure HTTP headers
    ↓
2. CORS — blocks non-whitelisted origins
    ↓
3. Body size limit — rejects bodies > 10kb
    ↓
4. NoSQL sanitizer — strips $ and . (injection prevention)
    ↓
5. HPP — prevents HTTP parameter pollution
    ↓
6. Input sanitizer — strips script tags from strings
    ↓
7. General rate limiter — 300 req per 15 min per IP
    ↓
8. Security logger — logs auth attempts (never passwords)
    ↓
9. Route-specific: protect (JWT) or kioskAuth (X-Kiosk-Token)
    ↓
10. Controller — actual business logic
```

Cheap rejections (CORS, body size) happen before expensive ones (JWT, DB queries).

---

## Part 11 — File-by-File Reference

### Frontend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `App.tsx` | Root component. Defines all routes. Mounts `ToastContainer`. Calls `syncManager.init()`. | Imports all pages, stores |
| `api.ts` | Central Axios instance. Attaches JWT. Handles 401 → logout. | Used by every service file |
| `authStore.ts` | Stores logged-in user + token. Persists to localStorage. `logout()` logs before clearing. | Used by every protected component |
| `gymStore.ts` | Stores settings + plans. Plan helpers. `triggerMemberRefresh()` signal. | Used by PaymentsPage, MembersPage, KioskPage |
| `toastStore.ts` | Toast notification queue. | Used by every page |
| `offlineQueue.ts` | IndexedDB wrapper. Stores pending actions with status tracking. | Used by syncManager |
| `syncManager.ts` | Online/offline watcher. Queue drainer. 409 duplicate handler. Custom event emitter. | Used by App.tsx, offlineService, SyncBadge |
| `offlineService.ts` | Offline-aware wrappers for check-in, checkout, walk-in, add member. | Used by StaffDashboard, MembersPage |
| `SyncBadge.tsx` | Topbar badge. Subscribes to syncManager + native online/offline events. | Mounted in OwnerLayout, StaffLayout |
| `sw.ts` | Service Worker. Workbox precache + NetworkFirst/CacheFirst strategies. Cross-origin route matching via url.href | Compiled separately by vite-plugin-pwa |
| `memberService.ts` | All member API calls. | Uses api.ts |
| `paymentService.ts` | All payment API calls. | Uses api.ts |
| `walkInService.ts` | Walk-in API calls. | Uses api.ts |
| `OwnerLayout.tsx` | Owner sidebar + topbar. Live/Offline badge. Offline banner. SyncBadge mount point. | Wraps all owner pages |
| `StaffLayout.tsx` | Staff sidebar + topbar. Offline badge. Offline banner. SyncBadge mount point. | Wraps all staff pages |
| `OwnerDashboard.tsx` | Full owner app. Switches pages via useSearchParams. Contains RenewModal. | Renders MembersPage, PaymentsPage, etc. |
| `StaffDashboard.tsx` | Full staff app. Optimistic check-in UI. offlineService wrappers. | Same structure as OwnerDashboard |
| `MembersPage.tsx` | Member table. Add/edit drawer with offline queuing. Settle balance modal. | memberService, syncManager, gymStore |
| `PaymentsPage.tsx` | Payment table. Log Payment modal. | paymentService, memberService, gymStore |
| `KioskPage.tsx` | Public kiosk. Raw fetch() with X-Kiosk-Token. | Direct fetch, no api.ts |
| `ActionLogPage.tsx` | Owner audit log. Server-side filters. | actionLogService |
| `MyActivityPage.tsx` | Staff personal activity. Timeline grouped by day. | actionLogService |

### Backend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `index.ts` | Server entry. Mounts middleware and routes. Creates default Settings. | Imports everything |
| `db.ts` | Connects to MongoDB Atlas. | Called from index.ts |
| `security.ts` | helmetMiddleware, rate limiters, corsOptions, sanitizers. ALLOWED_ORIGINS list. | Used in index.ts |
| `authMiddleware.ts` | `protect()` — verifies JWT. `requireRole()` — blocks wrong roles. | Used in all protected routes |
| `kioskAuth.ts` | Verifies X-Kiosk-Token with timing-safe comparison. | Used in kioskRoutes.ts |
| `authController.ts` | login, register, gym-info, settings CRUD. | User, Settings, logAction |
| `memberController.ts` | GYM-ID generation, getMembers, createMember, updateMember, checkIn, checkOut. | Member, logAction |
| `paymentController.ts` | createPayment (expiry logic), settleBalance, getPayments, getPaymentSummary. Settings cached per request. | Payment, Member, Settings, logAction |
| `walkInController.ts` | WALK-XXX daily reset, register, staff checkout, kiosk checkout. | WalkIn, Settings, logAction |
| `kioskController.ts` | kioskSearch, member check-in/out, walk-in lookup/checkout. No logAction (no req.user). | Member, WalkIn |
| `logAction.ts` | Writes ActionLog document. Never rethrows. | ActionLog model |

---

## Part 12 — Common Patterns to Recognize

### The service + controller pattern
Frontend calls offlineService → tries memberService → api.ts adds token → Express route → middleware → controller → model → logAction → response → UI update.

### The offline fallback pattern
```
try { online API call } catch (err) {
  if (!isNetworkError(err)) throw err;  // real errors still propagate
  await syncManager.enqueue(...);       // queue for later
  return { queued: true };              // UI handles gracefully
}
```

### The fire-and-forget log
Every controller ends with `await logAction(...)` inside a try/catch. If logging fails, the operation already succeeded.

### The optimistic UI pattern
StaffDashboard flips `selected.checkedIn` immediately before the API call resolves. The UI responds instantly. If the API fails, the optimistic update is reverted.

### The 409-as-success pattern
When offline-queued actions sync and the server returns 409 (already exists), this means the first sync attempt succeeded but the client didn't get the confirmation. Treat 409 as success — remove from queue, fire `gms:sync-duplicate` event for user notification.

### The `forceStaffView` prop
Same component, different scope. No code duplication.

### The settings cache pattern
Call `Settings.findOne()` once per request, pass to all helpers. Avoids multiple DB round trips.

### The cross-page refresh signal
`gymStore.triggerMemberRefresh()` → sets `lastMemberUpdate: Date.now()` → `MembersPage` watches with `useEffect` → refetches.

---

## Part 13 — What to Read First

If you're new to this codebase, read files in this order:

1. `shared/types.ts` — learn the data shapes first
2. `client/src/services/api.ts` — how the frontend talks to the backend
3. `server/src/middleware/authMiddleware.ts` — how protection works
4. `server/src/controllers/memberController.ts` — most complete controller example
5. `client/src/lib/syncManager.ts` — the offline sync brain
6. `client/src/lib/offlineService.ts` — how online/offline is abstracted
7. `client/src/store/authStore.ts` + `gymStore.ts` — global state
8. `client/src/pages/StaffDashboard.tsx` — how everything connects in a real page
9. `server/src/index.ts` — how middleware and routes are assembled

Then pick any feature and trace it end-to-end: button click → offlineService → syncManager OR api.ts → route → middleware → controller → model → logAction → response → UI update.

---

*GMS Architecture Deep-Dive — March 2026*
