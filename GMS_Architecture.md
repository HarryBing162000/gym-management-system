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

**Five environments:**
- **Local dev** — browser at `localhost:5173`, server at `localhost:5000`, database on MongoDB Atlas
- **Production** — browser at `ironcore-gms.onrender.com`, server at `ironcore-gms-server.onrender.com`, same Atlas database
- **Kiosk** — browser at `/kiosk` route, same server, no login required
- **Super Admin** — browser at `/superadmin` route, separate auth, hidden from public UI
- **PWA preview** — browser at `localhost:4173`, production build, SW active, tests offline behavior

---

## Part 2 — How a Request Travels (The Full Journey)

Let's trace what happens when a staff member checks in a gym member. This single action touches 8 files.

### Step 1: Staff presses "Check In" button
**File:** `client/src/pages/StaffDashboard.tsx`

```
StaffDashboard → offlineCheckIn(gymId, memberName)
```

The component calls the offline-aware wrapper, not `memberService.checkIn` directly.

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

**401 auto-logout:** The response interceptor catches 401, writes `sessionStorage("gms:logout-reason")` with the error message, then calls `authStore.logout()` + redirects to `/login`. `LoginPage` reads and clears this key on mount to show the forced logout reason.

### Step 4: Request hits the server router
**File:** `server/src/routes/memberRoutes.ts`

```
PATCH /api/members/:gymId/checkin → [protect middleware] → checkInMember controller
```

### Step 5: Middleware verifies the JWT and checks isActive + gym suspension
**File:** `server/src/middleware/authMiddleware.ts`

```javascript
// protect is async — adds two DB lookups per request
const decoded = jwt.verify(token, process.env.JWT_SECRET);

// Check 1: is this user still active?
const user = await User.findById(decoded.id).select("isActive ownerId").lean();
if (!user.isActive) return res.status(401).json({ message: "Account deactivated" });

// Check 2: is their gym still active? (staff only — uses ownerId to find GymClient)
if (user.ownerId) {
  const gym = await GymClient.findOne({ ownerId: user.ownerId }).select("status").lean();
  if (gym?.status === "suspended") return res.status(401).json({ message: "Gym suspended" });
}

req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
next();
```

This double DB check is what makes suspend-gym and deactivate-staff work **immediately** — the JWT is still valid but the request is blocked the moment `isActive` or `GymClient.status` changes.

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
StaffDashboard flips `checkedIn: true` on the selected member **immediately** before the API call returns.

**That's the full round trip, both online and offline paths.**

---

## Part 3 — Authentication Deep-Dive

### How login works

```
LoginPage → authService.login(email OR username, password)
         → POST /api/auth/login-owner OR /api/auth/login-staff
         → authController finds User by email/username
         → Rate limit check (5 wrong → 15-min lockout per account, in-memory)
         → bcrypt.compare(password, user.password)
         → jwt.sign({ id, role, name }, JWT_SECRET, { expiresIn })
         → returns { token, user }
         → authStore.setAuth(user, token)
         → token stored in localStorage via Zustand persist
         → GymClient.lastLoginAt updated (owner login only)
```

### Token expiry by role

| Role        | Expiry | Reason |
|-------------|--------|--------|
| Owner       | 7 days | Long session, manages system |
| Staff       | 12 hours | Security — shorter shift-based sessions |
| Super Admin | 12 hours | Admin sessions should not persist |

### Why name is in the JWT

`logAction()` needs the performer's name. If name wasn't in the JWT, every logged action would need a `User.findById()` call. Including name in the JWT payload saves a database round trip on every action.

### How logout works

```javascript
logout: () => {
  const { user, token } = get();  // grab BEFORE clearing
  if (user && token) {
    api.post('/action-logs/logout', {}).catch(() => {});  // fire-and-forget
  }
  set({ user: null, token: null, isAuthenticated: false });  // clear AFTER
}
```

### Role-based access

Four roles: `owner`, `staff`, `superadmin`, `member`. Members don't have User accounts — kiosk only. `protect` blocks unauthenticated. `requireRole()` blocks wrong roles. `protectSuperAdmin` is completely separate middleware using `SUPER_JWT_SECRET`.

### Forced logout message

When `protect` returns 401, the Axios response interceptor in `api.ts` writes the server's error message to `sessionStorage("gms:logout-reason")` **before** calling logout + redirect. `LoginPage` reads and clears this key on mount to display "Your gym has been suspended" or "Account deactivated" in the error box.

### Login rate limiting

In-memory map in `authController.ts`. Keys: `owner:email` / `staff:username`. 5 wrong attempts → 15-minute lockout. Other accounts unaffected. Map clears on server restart (acceptable at this scale).

### Owner first-time password flow

When Super Admin creates a gym client, the owner User is created with `isVerified: false` and a random placeholder password. A JWT is generated with `purpose: "set_password"` and emailed via Resend. When the owner clicks the link, sets their password, `isVerified` becomes `true`. They are then redirected to `/login` to log in manually — no auto-login.

---

## Part 4 — The Super Admin System

Super Admin is a completely separate authentication layer — it never shares tokens or models with the gym owner/staff system.

### How Super Admin auth works

```
/superadmin → SuperAdminLoginPage
→ POST /api/superadmin/login
→ Credentials checked against SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD (env vars only — no DB)
→ jwt.sign({ email, role: "superadmin" }, SUPER_JWT_SECRET, { expiresIn: "12h" })
→ superAdminStore.setAuth(token)  ← separate Zustand store (gms-superadmin)
→ navigate to /superadmin/dashboard
```

### GymClient model

One `GymClient` document per gym enrolled:
```
gymClientId    GYM-001, GYM-002... (sequential)
gymName        Display name
contactEmail   Owner email (immutable after creation)
ownerId        ref → User
status         active | suspended | deleted
billingStatus  trial | paid | overdue | cancelled
lastLoginAt    updated on every owner login
notes          internal Super Admin notes
```

### Gym suspension enforcement

When Super Admin suspends a gym:
1. `GymClient.status` → `"suspended"`
2. Owner's `User.isActive` → `false`
3. On their next API request, `protect` checks `user.isActive` → 401 → forced logout
4. Staff: `protect` checks `user.ownerId` → `GymClient.status === "suspended"` → 401 → forced logout
5. Both owner and all staff see the forced logout message on the LoginPage

The `ownerId` field on the `User` model (staff only) is set at staff creation time. It's the link that allows `protect` to find the staff member's gym without knowing which gym they belong to.

---

## Part 5 — The Timezone System

### The problem before this system
Every timezone operation was hardcoded as `"Asia/Manila"`. This was fine for a single-gym Philippine product but blocked international sales.

### The solution
`Settings.timezone` — a single IANA timezone string stored per gym. Default: `"Asia/Manila"`. Owner-configurable from Settings page.

### How it flows end to end

**Backend:**
```
authController.getGymInfo → returns settings.timezone to frontend
authController.updateWalkInPrices → accepts timezone in body, saves to Settings
walkInController.getTodayDate() → reads Settings.timezone for date calculation
autoCheckout.ts → reads Settings.timezone for getTodayInTz() + cron timezone option
```

**Frontend:**
```
gymStore.fetchGymInfo → maps data.settings.timezone → stores in GymSettings
gymStore.getTimezone() → returns settings.timezone ?? "Asia/Manila"
WalkInsPage → getWeekRange(timezone), getMonthRange(timezone)
PaymentsPage → getManilaDate() uses timezone, todayManila uses timezone
useClock.ts → reads getTimezone() for live clock display
SettingsPage → timezone dropdown, saves via PUT /api/auth/walkin-prices
```

**Rule:** Never hardcode `"Asia/Manila"` anywhere. Always call `gymStore.getTimezone()` on the frontend, always read `Settings.timezone` from DB on the backend.

### The name collision fix
```typescript
// In SettingsPage WalkInPricesSection:
const { setWalkInPrices, setClosingTime: setStoreClosingTime, setTimezone: setStoreTimezone } = useGymStore();
const [closingTime, setClosingTime] = useState(...);  // local state
const [timezone, setTimezone] = useState(...);         // local state
// Store setters aliased to avoid collision with useState setters
```

---

## Part 6 — The Offline-First System

### Why offline matters
The system is designed for gym front desks. Internet drops happen. A staff member should never be blocked from checking in a member or registering a walk-in because of a bad connection.

### The 5-layer architecture
```
React UI (optimistic)
    ↓ calls offlineService wrapper
offlineService (tries API, catches network errors)
    ↓ on network error, enqueues to
offlineQueue (IndexedDB — persistent, survives page reload)
    ↓ drained by
syncManager (watches navigator.onLine, retries 3×, handles 409)
    ↓ sends requests via
Service Worker + network → Render backend
```

### The offline cache pattern (per-page localStorage)

In addition to the write queue, each major page caches its last successful fetch in `localStorage`. When the page loads offline, it reads from cache instead of failing.

```
Page mounts → fetchData() called
  → if !navigator.onLine → read localStorage cache → populate UI → return
  → if online → fetch API → set state → write to localStorage cache
```

Online/offline event listeners auto-refresh data on reconnect:
```javascript
window.addEventListener("online", () => {
  setIsOffline(false);
  fetchData(); // triggers fresh fetch + cache write
});
```

Cache keys:
- `gms:dashboard-cache` — Owner Dashboard (memberStats, paymentSummary, walkInToday, atRisk, recentActivity, recentCheckins)
- `gms:staff-dashboard-cache` — Staff Dashboard (membersInside, walkInsToday, totalCheckins, atRisk, todayLog)
- `gms:payments-cache` — Payments list (unfiltered default view)
- `gms:payments-summary-cache` — Payment summary cards
- `gms:walkins-today-cache` — Today's walk-ins + summary + yesterday stats
- `gms:walkins-history-cache` — History (default week, unfiltered)

**Important:** Cache is only written on successful online fetch. If the cache is null (first visit with new code), visit each page while online first to seed it.

### The offlineRenew pattern

At-risk member renewal from the dashboard works offline:
```javascript
// offlineService.ts
export const offlineRenew = async (gymId, memberName, payload) => {
  try {
    const res = await memberService.renew(gymId, payload); // try online
    return { success: true, queued: false, message: res.message };
  } catch (err) {
    if (!isNetworkError(err)) throw err; // real errors still propagate
    await syncManager.enqueue({
      url: `/members/${gymId}`,
      method: "PATCH",
      body: payload,
      label: `Renew: ${memberName} — ${payload.plan}`,
      token: getToken(),
    });
    return { success: true, queued: true, message: "...queued offline..." };
  }
};
```

Both `RenewModal` (OwnerDashboard) and `StaffRenewModal` (StaffDashboard) call `offlineRenew` instead of `memberService.renew` directly.

### The 409-as-success pattern
When offline-queued actions sync and the server returns 409 (duplicate), the action already succeeded from a previous sync or direct action. Treat as success: remove from queue, fire `gms:sync-duplicate` custom event. Pages listening to this event show a friendly amber toast instead of an error.

---

## Part 7 — The Walk-in System

### Walk-in ID reset
`WALK-XXX` IDs reset every day. The counter is stored in `Settings` (or derived from today's walk-in count). This means `WALK-001` on Monday and `WALK-001` on Tuesday are different records. The `date` field (YYYY-MM-DD) provides uniqueness.

### History checkout problem and fix
When a staff member tries to check out a walk-in from the History tab, the old code filtered by `{ walkId, date: today }`. Past records weren't found → 404.

Fix: `PATCH /api/walkin/checkout` now accepts optional `date` in request body:
```
No date → default to getTodayDate() (Today tab behavior)
With date → use provided date (History tab behavior)
```

Full chain: `WalkInsPage.WalkInRow` passes `w.date` → `handleCheckOut(walkId, date)` → `offlineWalkInCheckOut(walkId, name, date)` → `walkInService.checkOut(walkId, date)` → `PATCH /api/walkin/checkout { walkId, date }` → controller `const date = req.body.date ?? getTodayDate()`.

### Walk-in Action column
Both Today and History tabs have an Action column:
- Today grid: 7 cols — `Guest | Pass | Amount | Check-in | Duration | By | Action`
- History grid: 8 cols — `Guest | Pass | Amount | Date | Duration | Status | By | Action`
- Not checked out → "Check Out" button (works from both tabs)
- Checked out → "✓ Done" badge

---

## Part 8 — The Auto Walk-out System

### How the cron works

```
server.ts boots → await initAutoCheckoutCron() called after Settings init
→ reads Settings.closingTime + Settings.timezone from DB
→ schedules: cron.schedule("0 22 * * *", runAutoCheckout, { timezone: "Asia/Manila" })
→ every day at closing time: runAutoCheckout() fires
→ WalkIn.updateMany({ date: today, isCheckedOut: false }, { isCheckedOut: true, checkOut: closingTime })
```

### Timezone in the cron
The `timezone` option in `cron.schedule()` now reads from `Settings.timezone` instead of hardcoding `"Asia/Manila"`. If a gym changes their timezone in Settings, the cron will use the new timezone on the next schedule rebuild (server restart or redeploy).

### getTodayInTz
```typescript
const getTodayInTz = (timezone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
```
Returns `"YYYY-MM-DD"` in the gym's configured timezone. Used to find today's walk-ins.

---

## Part 9 — The Live Clock

`useClock()` hook at `client/src/hooks/useClock.ts`:

```typescript
export function useClock(): { timeStr, dateStr, isClosingSoon, closingLabel } {
  const { getTimezone, settings } = useGymStore();
  const timezone = getTimezone();           // reads Settings.timezone
  const closingTime = settings?.closingTime ?? "22:00";

  // Ticks every second
  // timeStr: "10:30 PM" in gym's timezone
  // dateStr: "Monday, April 1, 2026" in gym's timezone
  // isClosingSoon: true when within 30 minutes of closingTime
  // closingLabel: "10:00 PM"
}
```

Used by `OwnerLayout` and `StaffLayout` topbars. Shows amber `⚠ Closes X:XX PM` warning when `isClosingSoon` is true.

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
4. NoSQL sanitizer — strips $ and .
    ↓
5. HPP — prevents HTTP parameter pollution
    ↓
6. Input sanitizer — strips script tags
    ↓
7. General rate limiter — 300 req per 15 min per IP
    ↓
8. Security logger — logs auth attempts (never passwords)
    ↓
9. Login rate limiter — 5 wrong attempts → 15-min lockout per account (in authController)
    ↓
10. Route-specific: protect (JWT + isActive + GymClient.status) | protectSuperAdmin | kioskAuth
    ↓
11. Controller — actual business logic
```

`protect` is async — adds ~2-10ms per request (two DB lookups: `isActive` + `GymClient.status`). This is the price of real-time suspension/deactivation.

---

## Part 11 — How Pages Are Organized

### Owner navigation

`OwnerDashboard.tsx` uses `useSearchParams`:
```
/dashboard               → DashboardContent
/dashboard?page=members  → MembersPage
/dashboard?page=payments → PaymentsPage
/dashboard?page=reports  → ReportsPage
/dashboard?page=settings → SettingsPage
/dashboard?page=walkins  → WalkInsPage
/dashboard?page=action-log → ActionLogPage
```

### Staff navigation

`StaffDashboard.tsx` works the same way. `forceStaffView={true}` passed to `PaymentsPage` — same component, restricted scope (today-only, date locked at `useState` init).

### Super Admin navigation

```
/superadmin              → SuperAdminLoginPage (public, hidden route)
/superadmin/dashboard    → SuperAdminDashboard (requires superAdminStore token)
```

### Public pages

```
/kiosk                   → KioskPage (no auth, X-Kiosk-Token)
/forgot-password         → ForgotPasswordPage (public)
/set-password?token=...  → SetPasswordPage (public, validates JWT)
/reset-password?token=.. → SetPasswordPage (same component, different label)
```

---

## Part 12 — File-by-File Reference

### Frontend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `App.tsx` | Root component. All routes. Mounts `ToastContainer`. Calls `syncManager.init()`. | All pages, stores |
| `api.ts` | Axios instance. Attaches JWT. 401 → writes `sessionStorage("gms:logout-reason")` → logout + redirect. | Every service file |
| `authStore.ts` | Owner/staff session. Persists to `gms-auth`. `logout()` logs before clearing. | Every protected component |
| `superAdminStore.ts` | Super admin session. Persists to `gms-superadmin`. Separate from authStore. | SuperAdmin pages |
| `gymStore.ts` | Settings + plans + walkInPrices + closingTime + **timezone**. `triggerMemberRefresh()`. `setClosingTime()`. `setTimezone()`. **`getTimezone()`** helper. | PaymentsPage, WalkInsPage, Layouts, useClock |
| `toastStore.ts` | Toast queue. | Every page |
| `offlineQueue.ts` | IndexedDB wrapper. Pending actions with status tracking. | syncManager |
| `syncManager.ts` | Online/offline watcher. Queue drainer. 409 handler. Custom events. | App.tsx, offlineService, SyncBadge |
| `offlineService.ts` | Offline-aware wrappers. `offlineRenew()`. `checkWalkInDuplicate()`. `offlineWalkInCheckOut(walkId, name, date?)`. | StaffDashboard, OwnerDashboard, WalkInsPage |
| `SyncBadge.tsx` | Topbar badge. syncManager + navigator.onLine. | OwnerLayout, StaffLayout |
| `useClock.ts` | Live clock hook. Reads `gymStore.getTimezone()`. Returns timeStr, dateStr, isClosingSoon, closingLabel. | OwnerLayout, StaffLayout |
| `sw.ts` | Service Worker. Workbox precache + strategies. | Compiled by vite-plugin-pwa |
| `OwnerLayout.tsx` | Owner sidebar + topbar. `useClock` hook. Live/Offline badge. Closing warning. | All owner pages |
| `StaffLayout.tsx` | Staff sidebar + topbar. `useClock` hook. Offline badge. Closing warning. | All staff pages |
| `OwnerDashboard.tsx` | Routes owner pages. `DashboardContent` has offline cache for all 5 data sections. | gymStore, memberService, paymentService, walkInService, actionLogService |
| `StaffDashboard.tsx` | Routes staff pages. `CheckInDesk` has offline cache. `StaffRenewModal` uses `offlineRenew`. | offlineService, memberService, walkInService |
| `WalkInsPage.tsx` | Walk-in management. Both tabs have Action column + checkout. Offline cache. Uses `gymStore.getTimezone()`. | walkInService, offlineService |
| `PaymentsPage.tsx` | Payment log. Offline read-only with amber banner. Uses `gymStore.getTimezone()` for date ranges. | paymentService, memberService, gymStore |
| `SettingsPage.tsx` | PlansManager + Walk-in Prices + Closing Time + **Timezone dropdown** + Account. | gymStore, api |
| `SuperAdminLoginPage.tsx` | Super admin login at `/superadmin`. | superAdminStore |
| `SuperAdminDashboard.tsx` | Gym client list + detail drawer. All CRUD + confirm modals. | superAdminStore |
| `SetPasswordPage.tsx` | Handles both set-password and reset-password flows. Redirects to /login on success. | authStore |
| `ForgotPasswordPage.tsx` | Owner forgot password. Calls /api/auth/forgot-password. | Direct fetch |
| `ReportsPage.tsx` | Redesigned charts (grouped bars, colorblind-safe blue/orange). Redesigned filter. PDF export. | paymentService, walkInService, gymStore |

### Backend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `server.ts` | Entry. Mounts middleware, routes. Seeds Settings. Calls `initAutoCheckoutCron()`. | Everything |
| `authMiddleware.ts` | `protect()` — async JWT verify + `isActive` DB check + `GymClient.status` suspension check via `User.ownerId`. `requireRole()`. | All protected routes |
| `superAdminMiddleware.ts` | `protectSuperAdmin()` — verifies SUPER_JWT_SECRET token. | Super admin routes |
| `authController.ts` | login (owner 7d, staff 12h token, rate limiting), gym-info (returns **timezone**), settings CRUD (saves **timezone**). `forgotPassword`, `setPassword`, `resetPassword`. | User, Settings, GymClient, logAction, emailService |
| `superAdminController.ts` | login, CRUD gym clients, suspend/reactivate/delete, resetOwnerPassword, resendInvite, hardDelete. | User, GymClient, Settings, emailService |
| `walkInController.ts` | WALK-XXX daily reset, register (dual duplicate guards), checkout (accepts optional `date`), kiosk checkout, auto-checkout trigger. `getTodayDate()` reads `Settings.timezone`. | WalkIn, Settings, logAction |
| `autoCheckout.ts` | `initAutoCheckoutCron()` + `runAutoCheckout()`. node-cron scheduler using `Settings.timezone`. `getTodayInTz(timezone)`. No more hardcoded Asia/Manila. | WalkIn, Settings |
| `emailService.ts` | Resend SDK. `sendSetPasswordEmail` + `sendResetPasswordEmail`. HTML templates. | Called from superAdminController, authController |
| `GymClient.ts` | GymClient model. gymClientId (GYM-001), status, billingStatus, lastLoginAt, notes. | superAdminController |
| `User.ts` | Owner+staff model. `isActive`, `isVerified`, `passwordResetToken`, `passwordResetExpires`. **`ownerId`** (staff only — links to owner's GymClient for suspension check). | authController, protect |
| `Settings.ts` | Singleton settings. Plans + walkInPrices + closingTime + **timezone** (IANA string, default "Asia/Manila"). | paymentController, authController, autoCheckout, walkInController |

---

## Part 13 — Common Patterns to Recognize

### The service + controller pattern
Frontend calls offlineService → tries memberService → api.ts adds token → Express route → middleware (JWT + isActive + suspension) → controller → model → logAction → response → UI update.

### The offline fallback pattern
```
try { online API call } catch (err) {
  if (!isNetworkError(err)) throw err;  // real errors still propagate
  await syncManager.enqueue(...);       // queue for later
  return { queued: true };
}
```

### The offline cache pattern
```
fetchData() {
  if (!navigator.onLine) { read localStorage cache; return; }
  const res = await apiCall();
  setState(res);
  localStorage.setItem(CACHE_KEY, JSON.stringify(res));  // write cache
}
```

### The fire-and-forget log
Every controller ends with `await logAction(...)` inside a try/catch. If logging fails, the operation already succeeded.

### The optimistic UI pattern
StaffDashboard flips state immediately before API call resolves. If the API fails, the optimistic update is reverted.

### The 409-as-success pattern
When offline-queued actions sync and the server returns 409, the action already exists. Treat as success — remove from queue, fire `gms:sync-duplicate` event.

### The rollback pattern (GymClient creation)
```
User.create(...)  → success
GymClient.create(...) → throws
  → catch: User.findByIdAndDelete(owner._id)  // rollback orphaned User
  → rethrow
```

### The email error surface pattern
Resend calls are wrapped in try/catch. On failure, the gym is still created but `emailSent: false` + `emailError` are returned in the response so Super Admin knows to resend manually.

### The `forceStaffView` prop
Same component, different scope. No code duplication.

### The settings cache pattern
Call `Settings.findOne()` once per request, pass to all helpers.

### The cross-page refresh signal
`gymStore.triggerMemberRefresh()` → `lastMemberUpdate: Date.now()` → `MembersPage` watches with `useEffect` → refetches.

### The name-collision alias pattern
When a store action and a useState setter share the same name:
```typescript
const { setClosingTime: setStoreClosingTime, setTimezone: setStoreTimezone } = useGymStore();
const [closingTime, setClosingTime] = useState(...);   // local
const [timezone, setTimezone] = useState(...);          // local
```

### The getTimezone pattern
Never hardcode `"Asia/Manila"` anywhere. Always:
```typescript
// Frontend
const timezone = useGymStore.getState().getTimezone(); // or via hook

// Backend
const settings = await Settings.findOne({}).select("timezone").lean();
const timezone = settings?.timezone ?? "Asia/Manila";
```

---

## Part 14 — What to Read First

If you're new to this codebase, read files in this order:

1. `shared/types.ts` — learn the data shapes first
2. `client/src/services/api.ts` — how frontend talks to backend + 401 handling + sessionStorage message
3. `server/src/middleware/authMiddleware.ts` — how protection + isActive + GymClient suspension check works
4. `server/src/controllers/memberController.ts` — most complete controller example
5. `client/src/lib/syncManager.ts` — the offline sync brain
6. `client/src/lib/offlineService.ts` — how online/offline is abstracted
7. `client/src/store/authStore.ts` + `gymStore.ts` — global state, `getTimezone()` helper
8. `client/src/pages/StaffDashboard.tsx` — how everything connects in a real page
9. `server/src/server.ts` — how middleware and routes are assembled
10. `server/src/controllers/superAdminController.ts` — multi-tenant gym creation flow

Then pick any feature and trace it end to end.

---

## ⚠️ AI USAGE NOTE

This file is a deep reference.

For AI assistants:
- Do NOT load this file unless explicitly requested
- Use CLAUDE.md for rules and constraints
- Use this file only for:
  - debugging
  - architecture understanding
  - complex feature implementation

*GMS Architecture Deep-Dive — April 2026*
