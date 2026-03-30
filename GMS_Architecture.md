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

**Four environments:**
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

**401 auto-logout:** The response interceptor catches 401 and calls `authStore.logout()` + redirects to `/login`. This is what makes suspend/deactivate work transparently — the backend returns 401, the frontend catches it, the user is kicked out.

### Step 4: Request hits the server router
**File:** `server/src/routes/memberRoutes.ts`

```
PATCH /api/members/:gymId/checkin → [protect middleware] → checkInMember controller
```

### Step 5: Middleware verifies the JWT **and checks isActive**
**File:** `server/src/middleware/authMiddleware.ts`

```javascript
// protect is now async — adds one DB lookup per request
const decoded = jwt.verify(token, process.env.JWT_SECRET);
const user = await User.findById(decoded.id).select("isActive").lean();
if (!user.isActive) return res.status(401).json({ message: "Account suspended/deactivated" });
req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
next();
```

This live `isActive` check is what makes suspend-gym and deactivate-staff work immediately — the JWT is still valid but the request is blocked the moment `isActive` becomes false.

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
         → bcrypt.compare(password, user.password)
         → jwt.sign({ id, role, name }, JWT_SECRET, { expiresIn })
         → returns { token, user }
         → authStore.setAuth(user, token)
         → token stored in localStorage via Zustand persist
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

### Owner first-time password flow

When Super Admin creates a gym client, the owner User is created with `isVerified: false` and a random placeholder password. A JWT is generated with `purpose: "set_password"` and emailed via Resend. When the owner clicks the link, sets their password, and `isVerified` becomes `true`. They are then redirected to `/login` to log in manually — no auto-login.

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
trialEndsAt    30 days from creation
lastLoginAt    Updated on every owner login
notes          Internal Super Admin notes
```

### Gym creation flow

```
Super Admin fills form → POST /api/superadmin/gyms
→ User.create({ email, role: "owner", isVerified: false, password: randomHash })
→ GymClient.create({ gymClientId, ownerId, ... })
  [if GymClient.create fails → User.findByIdAndDelete(owner._id) — rollback]
→ Settings.create({ gymName, plans: defaults, walkInPrices: defaults })
→ generateSetPasswordToken(userId)
→ sendSetPasswordEmail({ to: ownerEmail, token })
→ Resend delivers invite email
```

### Suspend flow

```
Super Admin clicks Suspend → PATCH /api/superadmin/gyms/:id/suspend
→ GymClient.status = "suspended"
→ User.findByIdAndUpdate(ownerId, { isActive: false })
→ Next owner API request → protect middleware → isActive check → 401
→ api.ts interceptor → authStore.logout() → redirect to /login
```

The owner is kicked out on their very next API request — no manual session invalidation needed.

---

## Part 5 — The Offline-First PWA System

This is the most complex part of the system. Five layers working together.

### Layer 1: Service Worker (`sw.ts`)

**Cache strategies:**
- App shell (HTML/JS/CSS) → Cache First (precached by Workbox on deploy)
- `GET /api/members` → Network First, 10s timeout, falls back to cache
- `GET /api/walkin/today` → Network First, 8s timeout, falls back to cache
- `GET /api/auth/gym-info` → Cache First, 24h expiry
- Auth + payments → Network Only (never cache)

**Critical detail:** Route matchers use `url.href.includes()` not `url.pathname`. The API is on a different origin so `url.pathname` would never match cross-origin requests.

**TypeScript issue:** `(self as any).__WB_MANIFEST` prevents TypeScript from renaming the literal string during compilation.

### Layer 2: offlineQueue (`offlineQueue.ts`)

An IndexedDB wrapper that stores pending write actions. Actions survive tab closes, page refreshes, and app restarts.

```typescript
interface QueueEntry {
  id: string;
  url: string;          // e.g. "/members/GYM-1023/checkin"
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: Record<string, unknown>;
  timestamp: number;
  retries: number;
  status: "pending" | "syncing" | "failed";
  label: string;        // "Check-in: Juan Dela Cruz"
  token: string;        // JWT at time of queuing
}
```

### Layer 3: syncManager (`syncManager.ts`)

Watches `navigator.onLine`. When internet restores, drains the queue in timestamp order. Retries 3x before marking failed. Fires custom events:
- `gms:sync-complete` — batch succeeded
- `gms:sync-failed` — batch had failures
- `gms:sync-duplicate` — 409 received (already exists server-side)

**Walk-in 409 handling:** `WalkInsPage` listens for `gms:sync-duplicate` with `url.includes("/walkin/register")` → shows amber info toast instead of error.

### Layer 4: offlineService (`offlineService.ts`)

Offline-aware wrappers that abstract the online/offline decision from UI components. Components call `offlineCheckIn()`, never `memberService.checkIn()` directly.

### Layer 5: SyncBadge (`SyncBadge.tsx`)

Topbar indicator. Orange = pending. Red = failed. Amber = offline. Subscribes to both `syncManager` and native `navigator.onLine` events.

---

## Part 6 — Walk-in Duplicate Prevention

Walk-ins have two duplicate guards (same pattern as Payment model):

### Guard 1 — Same name today
```javascript
const existing = await WalkIn.findOne({ date: today, name: /^name$/i });
if (existing) return 409 with existing walkId
```
Prevents registering the same person twice in one day.

### Guard 2 — 10-second rapid-fire guard
```javascript
const recentDuplicate = await WalkIn.findOne({
  staffId: req.user.id,
  passType,
  checkIn: { $gte: tenSecondsAgo }
});
if (recentDuplicate) return 409 with original document
```
Catches double-clicks, network retries, and offline queue re-syncing an already-created entry.

### Frontend fix (StaffDashboard)
`offlineWalkInRegister` already calls `walkInService.register` internally when online. The old bug called it a second time after — creating two records. The second call was blocked by Guard 1 (409), which surfaced as a false error. Fix: one call only, use the result directly.

---

## Part 7 — Auto Walk-out System

```
server/src/utils/autoCheckout.ts
```

### How it works

1. `initAutoCheckoutCron()` called once in `server.ts` after Settings init
2. Reads `Settings.closingTime` ("HH:mm" format, Manila time, default "22:00")
3. Schedules `node-cron` job: `"minute hour * * *"` in Asia/Manila timezone
4. At closing time: `WalkIn.updateMany({ date: today, isCheckedOut: false }, { isCheckedOut: true, checkOut: closingTime })`
5. Manual trigger available: `POST /api/walkin/auto-checkout` (owner only)

### Closing time configuration

Owner sets it in **Settings → Walk-in Day Passes** → time picker. Stored in `Settings.closingTime`. Flows to `gymStore.settings.closingTime`. Live clock in topbar reads it.

---

## Part 8 — Live Clock + Closing Warning

Both layouts use a `useClock(closingTime?)` hook:

```typescript
// Ticks every second
const { timeStr, dateStr, closingWarning, closingLabel } = useClock(settings?.closingTime);
```

- Shows live time + date in Manila timezone
- `closingWarning = true` when within 30 minutes of closing time
- Topbar shows amber `⚠ Closes X:XX PM` badge during that window
- Staff can always see exactly when the gym closes without checking Settings

---

## Part 9 — Report Charts

Both charts use colorblind-safe colors: **Blue (#2563eb) + Orange (#ea580c)**.

Safe for deuteranopia, protanopia, and tritanopia.

### Revenue & Walk-in Trend

- **Blue bars** — membership payment revenue per day (all payment types: new_member, renewal, manual, balance_settlement)
- **Orange bars** — walk-in count per day (not revenue — raw count on independent scale)
- Each bar type has its own Y-axis scale — prevents walk-in counts (3-10) from being invisible against revenue (₱1000+)
- Horizontal gridlines + labeled Y-axis for readability
- Hover tooltip shows exact ₱ and count

### Revenue Source — Last 6 Weeks

- **Blue bars** — membership revenue (actual payments from DB)
- **Orange bars** — walk-in revenue (estimated: count × average pass price)
- Both bars are on the same scale — shows revenue mix per week
- "est." label on walk-in column — walk-ins aren't formal payment records
- Weekly totals shown below each group

### Report Period Filter

Five presets: Today, Last 7 Days, This Week (Mon–today), This Month, Custom range.
Active preset shown as solid orange button. Active date range always visible as orange badge in filter header.

---

## Part 10 — Settings Model

Settings is a singleton — one document ever exists per gym.

```typescript
interface ISettings {
  gymName: string;
  gymAddress: string;
  logoUrl?: string;
  logoPublicId?: string;
  plans: IPlan[];           // single source of truth for membership pricing
  walkInPrices: IWalkInPrices;
  closingTime: string;      // "HH:mm" 24h, Manila time — default "22:00"
}
```

Why singleton? Every gym has one owner, one set of prices, one set of plans. No need for a user-keyed collection. If the document doesn't exist on server start, it's seeded with defaults.

### Why settings are cached per request

`paymentController.ts` might need settings 3-4 times during one payment. Instead of calling `Settings.findOne()` each time:

```javascript
const settings = await Settings.findOne();  // once at top of controller
const price = getPlanPrice(plan, settings);  // pass to helpers
```

---

## Part 11 — How Pages Are Organized

### Owner navigation

`OwnerDashboard.tsx` uses `useSearchParams`:
```
/dashboard               → DashboardContent
/dashboard?page=members  → MembersPage
/dashboard?page=payments → PaymentsPage
/dashboard?page=reports  → ReportsPage
```

### Staff navigation

`StaffDashboard.tsx` works the same way. `forceStaffView={true}` passed to `PaymentsPage` — same component, restricted scope.

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

## Part 12 — Security Layers

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
9. Route-specific: protect (JWT + isActive) | protectSuperAdmin | kioskAuth
    ↓
10. Controller — actual business logic
```

`protect` is now async — adds one DB lookup (~1-5ms) per request to check `isActive`. This is the price of real-time suspension/deactivation.

---

## Part 13 — File-by-File Reference

### Frontend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `App.tsx` | Root component. All routes. Mounts `ToastContainer`. Calls `syncManager.init()`. | All pages, stores |
| `api.ts` | Axios instance. Attaches JWT. 401 → logout + redirect. | Every service file |
| `authStore.ts` | Owner/staff session. Persists to `gms-auth`. `logout()` logs before clearing. | Every protected component |
| `superAdminStore.ts` | Super admin session. Persists to `gms-superadmin`. Separate from authStore. | SuperAdmin pages |
| `gymStore.ts` | Settings + plans + walkInPrices + closingTime. `triggerMemberRefresh()` signal. `setClosingTime()`. | PaymentsPage, MembersPage, Layouts |
| `toastStore.ts` | Toast queue. | Every page |
| `offlineQueue.ts` | IndexedDB wrapper. Pending actions with status tracking. | syncManager |
| `syncManager.ts` | Online/offline watcher. Queue drainer. 409 handler. Custom events. | App.tsx, offlineService, SyncBadge |
| `offlineService.ts` | Offline-aware wrappers. `checkWalkInDuplicate()` for IndexedDB duplicate check. | StaffDashboard, WalkInsPage |
| `SyncBadge.tsx` | Topbar badge. syncManager + navigator.onLine. | OwnerLayout, StaffLayout |
| `sw.ts` | Service Worker. Workbox precache + strategies. Cross-origin via url.href. | Compiled by vite-plugin-pwa |
| `OwnerLayout.tsx` | Owner sidebar + topbar. `useClock` hook. Live/Offline badge. Closing warning. | All owner pages |
| `StaffLayout.tsx` | Staff sidebar + topbar. `useClock` hook. Offline badge. Closing warning. | All staff pages |
| `SuperAdminLoginPage.tsx` | Super admin login at `/superadmin`. | superAdminStore |
| `SuperAdminDashboard.tsx` | Gym client list + detail drawer. All CRUD + confirm modals. | superAdminStore |
| `SetPasswordPage.tsx` | Handles both set-password and reset-password flows. Redirects to /login on success. | authStore |
| `ForgotPasswordPage.tsx` | Owner forgot password. Calls /api/auth/forgot-password. | Direct fetch |
| `ReportsPage.tsx` | Redesigned charts (grouped bars, colorblind-safe). Redesigned filter. PDF export. | paymentService, walkInService, gymStore |
| `SettingsPage.tsx` | PlansManager + Walk-in Prices + Closing Time + Change Password. No Change Email. | gymStore, api |

### Backend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `server.ts` | Entry. Mounts middleware, routes. Seeds Settings. Calls `initAutoCheckoutCron()`. | Everything |
| `authMiddleware.ts` | `protect()` — async JWT verify + isActive DB check. `requireRole()`. | All protected routes |
| `superAdminMiddleware.ts` | `protectSuperAdmin()` — verifies SUPER_JWT_SECRET token. | Super admin routes |
| `authController.ts` | login (owner 7d, staff 12h token), gym-info (includes closingTime), settings CRUD. `forgotPassword`, `setPassword`, `resetPassword`. | User, Settings, GymClient, logAction, emailService |
| `superAdminController.ts` | login, CRUD gym clients, suspend/reactivate/delete, resetOwnerPassword, resendInvite, hardDelete. | User, GymClient, Settings, emailService |
| `walkInController.ts` | WALK-XXX daily reset, register (dual duplicate guards), checkout, kiosk checkout, auto-checkout trigger. | WalkIn, Settings, logAction |
| `autoCheckout.ts` | `initAutoCheckoutCron()` + `runAutoCheckout()`. node-cron scheduler in Manila timezone. | WalkIn, Settings |
| `emailService.ts` | Resend SDK. `sendSetPasswordEmail` + `sendResetPasswordEmail`. HTML templates. | Called from superAdminController, authController |
| `GymClient.ts` | GymClient model. gymClientId (GYM-001), status, billingStatus, lastLoginAt, notes. | superAdminController |
| `User.ts` | Owner+staff model. `isVerified`, `passwordResetToken`, `passwordResetExpires` added. | authController, protect |
| `Settings.ts` | Singleton settings. Plans + walkInPrices + `closingTime`. | paymentController, authController, autoCheckout |

---

## Part 14 — Common Patterns to Recognize

### The service + controller pattern
Frontend calls offlineService → tries memberService → api.ts adds token → Express route → middleware (JWT + isActive) → controller → model → logAction → response → UI update.

### The offline fallback pattern
```
try { online API call } catch (err) {
  if (!isNetworkError(err)) throw err;  // real errors still propagate
  await syncManager.enqueue(...);       // queue for later
  return { queued: true };
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
const { setClosingTime: setStoreClosingTime } = useGymStore(); // alias
const [closingTime, setClosingTime] = useState(...);            // local
```

---

## Part 15 — What to Read First

If you're new to this codebase, read files in this order:

1. `shared/types.ts` — learn the data shapes first
2. `client/src/services/api.ts` — how frontend talks to backend + 401 handling
3. `server/src/middleware/authMiddleware.ts` — how protection + isActive check works
4. `server/src/controllers/memberController.ts` — most complete controller example
5. `client/src/lib/syncManager.ts` — the offline sync brain
6. `client/src/lib/offlineService.ts` — how online/offline is abstracted
7. `client/src/store/authStore.ts` + `gymStore.ts` — global state
8. `client/src/pages/StaffDashboard.tsx` — how everything connects in a real page
9. `server/src/server.ts` — how middleware and routes are assembled
10. `server/src/controllers/superAdminController.ts` — multi-tenant gym creation flow

Then pick any feature and trace it end-to-end.

---

*GMS Architecture Deep-Dive — March 2026*
