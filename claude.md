# LakasGMS — CLAUDE.md

## ⚠️ CRITICAL INSTRUCTION FOR AI — READ BEFORE WRITING ANY CODE

**Before sending any code to the developer, you MUST mentally simulate and verify the code is correct.**

Specifically:
1. **Check hook ordering** — In React components, all `useState` calls must come before `useCallback` and `useEffect`. Never reference a `const` (like a `useCallback` result) before it is declared — JavaScript `const` is not hoisted.
2. **Check all import statements** — If you use a hook like `useEffect`, `useCallback`, `useSearchParams`, etc., verify it is in the import list. Never assume it is already imported.
3. **Check TypeScript types** — If a Mongoose schema field has `default: null`, the interface must declare it as `string | null`, not `string | undefined`. Match the interface to what the DB actually stores.
4. **Check ownerId scoping** — Every DB query touching Member, Payment, WalkIn, ActionLog, or Settings MUST include `{ ownerId }`. Never write a query without it.
5. **Check CORS headers** — If you add a new custom HTTP header to any fetch/axios call, add it to `allowedHeaders` in `server/src/middleware/security.ts` or the browser preflight will block it.
6. **Verify the full call chain** — If a function signature changes (e.g. adding an `ownerId` param), trace every call site and update them all. Never leave stale callers.
7. **No upsert on Settings** — Never use `upsert: true` on Settings queries. Settings is created by Super Admin on gym creation. If it's missing, return a hard 500 error.

**If you are not confident the code will work, say so and ask for the missing file before writing the fix. Sending broken code wastes the developer's time.**

---

## Project Overview
Full-stack gym management SaaS with role-based access for owners, staff, and members.

**Product Name:** LakasGMS ("Lakas" = strength in Filipino)
**GitHub:** HarryBing162000/gym-management-system
**Deployed:** Render (frontend + backend)
**Frontend URL:** https://ironcore-gms.onrender.com
**Backend URL:** https://ironcore-gms-server.onrender.com
**Generalized name:** Gym Management System (do NOT hardcode "IronCore" or "LakasGMS" anywhere in code)

---

## Tech Stack

### Frontend
- React + TypeScript + Vite
- Tailwind CSS v4 — use `style={{}}` inline for spacing, NOT utility classes like `p-4`
- Zustand (global state)
- TanStack Query (server state / API calls)
- **PWA** — vite-plugin-pwa + Workbox (offline-first)

### Backend
- Node.js + Express 5 + TypeScript
- MongoDB Atlas (Mongoose)
- JWT authentication — payload includes `{ id, role, name }`
- bcrypt (rounds: 12)
- Zod (request validation)
- Manual NoSQL sanitizer — replaces express-mongo-sanitize (incompatible with Express 5)
- node-cron — auto walk-out scheduler
- Nodemailer + Gmail SMTP — email service (replaced Resend due to free tier restrictions)

---

## Color Scheme
| Name         | Hex       |
|--------------|-----------|
| Cyber Orange | `#FF6B1A` |
| Gold         | `#FFB800` |
| Charcoal     | `#1a1a1a` |

---

## Architecture

### Auth & Roles
| Role        | Login Identifier  | Token Expiry | Notes                              |
|-------------|-------------------|--------------|------------------------------------|
| Owner       | Email             | 7 days       | Full system access                 |
| Staff       | Username          | 12 hours     | Limited — sees own actions only    |
| Super Admin | Email (env only)  | 12 hours     | Separate SUPER_JWT_SECRET          |
| Member      | Auto GYM-XXXX ID  | —            | Gym client, separate from User     |

- `User` model → owner + staff authentication
- `Member` model → gym clients (intentionally separate from User)
- `GymClient` model → one document per gym enrolled via Super Admin
- JWT middleware (`protect`) on all protected routes — **async with live DB isActive + gym suspension check**
- `AuthRequest` extends `Request` with `user: { id, role, name }`
- `requireRole(...roles)` for role-based access control
- `protectSuperAdmin` — completely separate middleware using `SUPER_JWT_SECRET`
- **Auto-logout:** `protect` checks `isActive` AND `GymClient.status` on every request
- **Gym suspension:** suspending a gym kicks owner AND all staff on their next request via `User.ownerId`
- **Login rate limiting:** 5 wrong attempts → 15-min lockout per account (owner/staff by identifier, Super Admin by IP)
- **Forced logout message:** `sessionStorage("gms:logout-reason")` written by 401 interceptor, read + cleared on LoginPage mount

### Token System
- `generateOwnerToken()` → 7 days (JWT_SECRET)
- `generateStaffToken()` → 12 hours (JWT_SECRET)
- `superAdminLogin` → 12 hours (SUPER_JWT_SECRET — separate secret)
- Set/reset password tokens → 24h / 1h (JWT_SECRET, purpose field)
- **Impersonation token** → 15 min (IMPERSONATE_SECRET — separate secret, purpose: `"impersonate"`, includes `jti` for single-use enforcement)
- **Impersonation session token** → 4h (JWT_SECRET, `impersonated: true` in payload) — 15m was too short, 7d was too long

### ID Schemes
- Members: `GYM-XXXX` (auto-generated, **sequential per gym** — `generateGymId(ownerId)` scopes counter to each owner)
- Walk-ins: `WALK-XXX` (daily-resetting, **per gym per day** — `generateWalkId(today, ownerId)` scopes counter per owner per date)
- Gym clients: `GYM-001` format (sequential, via `generateGymClientId()`)

### Key Zustand Stores
| Store              | Responsibility |
|--------------------|----------------|
| `authStore`        | Current user session, role, JWT token. `logout()` fires POST /api/action-logs/logout BEFORE clearing token. `clearSession()` wipes state synchronously without action-log POST — used by End Session in impersonation. Persist key: `gms-auth`. `setAuth(user, token)` — user first, token second |
| `gymStore`         | Settings + plans + walkInPrices + closingTime + **timezone** + **ownerId**. `triggerMemberRefresh()`. `setClosingTime()`. `setTimezone()`. `getTimezone()` helper. `getOwnerId()` helper — used for kiosk launch URL. `resetStore()` — call on logout |
| `toastStore`       | Global toast notifications |
| `superAdminStore`  | Super admin session, separate token. `logout()` clears `gms:sa-welcomed` from sessionStorage. Persist key: `gms-superadmin` |

### Settings (Single Source of Truth)
- `Settings.gymName`, `Settings.gymAddress`, `Settings.logoUrl` (Cloudinary)
- `Settings.plans[]` — membership plans (drives PlansManager)
- `Settings.walkInPrices` — walk-in pass pricing
- `Settings.closingTime` — "HH:mm" 24h format (default `"22:00"`)
- `Settings.timezone` — IANA timezone string (default `"Asia/Manila"`) ← replaces all hardcoded Asia/Manila

---

## Data Models

### User
- Roles: `owner` | `staff`
- Owner login: email. Staff login: username
- Fields: `isActive`, `isVerified`, `passwordResetToken`, `passwordResetExpires`
- `isVerified: false` until owner clicks set-password email link from Super Admin invite
- **`ownerId`** — staff only, stored as ObjectId pointing to the owner's `User._id`. Field is **absent** on owner documents (no `default: null` — removed to prevent misleading null). Owners derive their `ownerId` at runtime via `protect` middleware as `decoded.id`.
- `impersonated?: boolean` — on `User` type in `client/src/types/index.ts` — set to `true` on impersonation session tokens

### Member
- Hard duplicate blocking on: name, email, phone — **scoped to ownerId** (different gyms can have members with the same name/email/phone)
- ID format: `GYM-XXXX` — **sequential per gym**, resets to GYM-1001 for each new gym's first member
- `balance` field tracks outstanding unpaid amount
- `checkedIn` + `lastCheckIn` for real-time presence tracking
- **`ownerId`** — all queries scoped by `ownerId`. `generateGymId(ownerId)` uses the owner's last member to determine the next ID.

### GymClient
- One per gym enrolled by Super Admin
- Fields: `gymClientId` (GYM-001), `gymName`, `contactEmail`, `ownerId`, `status`, `billingStatus`, `trialEndsAt`, `billingRenewsAt`, `notes`, `lastLoginAt`
- `status`: `active` | `suspended` | `deleted`
- `billingStatus`: `trial` | `paid` | `overdue` | `cancelled` — validated on backend before DB write
- `lastLoginAt` — updated on every owner login via `GymClient.findOneAndUpdate({ ownerId }, { lastLoginAt: new Date() })` in `loginOwner` (fire-and-forget)
- `billingRenewsAt` — set manually by Super Admin when recording a client's monthly payment

### SuperAdminAuditLog
- MongoDB collection: `superadminauditlogs`
- Fields: `action` (enum), `detail`, `ip`, `gymId` (optional ref to GymClient), `timestamp`
- Replaces previous in-memory array — survives server restarts
- TTL index optional (commented out) — 1 year retention
- Indexes: `{ timestamp: -1 }`, `{ gymId, timestamp: -1 }`
- `logSa()` is fire-and-forget — never crashes calling route
- Endpoint supports filters: `?action=login&gymId=<id>&limit=100`

### WalkIn
- Fields: `ownerId`, `passType`, `amount`, `checkIn`, `checkOut`, `staffId`, **`date`** (YYYY-MM-DD string in gym timezone)
- Pass types: Regular, Student, Couple
- IDs reset daily per gym: `WALK-XXX` — **`generateWalkId(today, ownerId)`** scopes counter to each gym, so each gym starts at WALK-001 every day
- **Unique index:** `{ ownerId, date, walkId }` — allows WALK-001 to exist across different gyms on the same day
- **Duplicate guards:** same-name today scoped by `ownerId` (409) + 10-second rapid-fire guard
- **Auto walk-out:** `runAutoCheckout()` called by cron at `Settings.closingTime` in `Settings.timezone`
- **History checkout:** `PATCH /api/walkin/checkout` accepts optional `date` body param for past-day records
- **Kiosk checkout:** searches by `{ ownerId, walkId, isCheckedOut: false }` — always include ownerId
- **`ownerId`** — all queries (register, checkout, today, history, yesterday, kiosk) scoped by `ownerId`
- **Walk-in prices:** `getPassAmount(passType, ownerId)` reads `Settings.walkInPrices` per gym — not a global fallback

### Payment
- Fields: `ownerId`, `method`, `type`, `amountPaid`, `balance`, `isPartial`, `processedBy`
- Types: `new_member`, `renewal`, `manual`, `balance_settlement`
- Duplicate guard: 10 seconds — **scoped by `ownerId`** on both `createPayment` and `settleBalance`
- Backend aggregate returns `grandTotal`, `cashTotal`, `onlineTotal`
- **`ownerId`** — all queries scoped. `createPayment` member lookup uses `{ ownerId, gymId }` — prevents cross-gym member mutation
- **`processedBy`** — always cast to `new mongoose.Types.ObjectId(processedBy)` in ALL Payment.create() calls including `autoLogPayment` — plain string breaks `populate("processedBy")`

### ActionLog
- Fields: `ownerId` (ref → User owner), `action` (enum), `performedBy` ({ userId, name, role }), `targetId`, `targetName`, `detail`, `timestamp`
- **`ownerId` is required** — scopes all action log queries to one gym
- Indexes: `{ ownerId: 1, timestamp: -1 }`, `{ timestamp: -1 }`, `{ 'performedBy.userId': 1, timestamp: -1 }`

### Settings
- **One document per gym** — scoped by `ownerId` (unique index). Not a singleton.
- `timezone: string` (default `"Asia/Manila"`)
- `logoUrl?: string | null` — allow null (schema default is null)
- `logoPublicId?: string | null` — allow null (schema default is null)
- Always query with `{ ownerId }` — never `Settings.findOne({})` which returns first gym's settings
- Never use `upsert: true` — Settings is created by Super Admin on gym creation. Missing Settings = hard 500 error.

---

## Super Admin System

### Auth
- Credentials in env (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`) — no DB record
- Separate JWT signed with `SUPER_JWT_SECRET`
- Protected by `protectSuperAdmin` middleware
- Frontend: `/superadmin` (hidden route, not linked anywhere in public UI)
- **Rate limited:** 5 wrong attempts → 15-min lockout by IP address
- **Timing-safe comparison:** `crypto.timingSafeEqual()` used for credential check
- **x-forwarded-for sanitized:** takes first IP only — prevents rate limit bypass via header spoofing
- **Idle timeout:** 15 min inactivity → auto-logout. 60s warning modal with countdown before logout fires.
- **Title hardcoded:** All SA pages (login, dashboard, audit log) show `"⚡ SuperAdmin - LakasGMS"` — never dynamic

### Capabilities
- Create gym client + owner account → sends set-password invite email via Nodemailer/Gmail
- List / view / edit gym clients (search + filter chips: All / Active / Suspended / Deleted)
- Suspend / reactivate / soft-delete / hard-delete gym
- Reset owner password (sends reset email)
- Resend invite email
- Track last login per gym (`lastLoginAt`)
- **Impersonate owner** — 4h scoped support session (single-use token)
- **Billing lifecycle** — change billingStatus (validated), set `billingRenewsAt` when client pays monthly
- **Audit log** — MongoDB persistent, `GET /api/superadmin/audit-log` with filters
- **Audit log viewer** — dedicated page at `/superadmin/audit-log` with action/date/gym filters + CSV export

### Security Hardening (all applied)
- `billingStatus` validated against enum `["trial","paid","overdue","cancelled"]` before DB write
- `hardDeleteGym` deletes Settings by `ownerId` (not `gymName`) — prevents wrong-gym deletion
- `x-forwarded-for` takes first IP only via `.split(",")[0].trim()`
- Impersonation session token: 4h (not 15m or 7d)
- `gms:sa-welcomed` cleared on SA logout so welcome modal shows again on next login
- `billingRenewsAt` date picker has `min` = today — prevents past date selection

### Billing Renewal Flow (manual — pre-PayMongo)
```
Client pays monthly → Super Admin opens gym drawer
→ Set billingStatus = "paid"
→ Set Next Renewal Date = next month's date (min = today)
→ Save Changes
```
Future: PayMongo webhook auto-updates `billingStatus` + `billingRenewsAt`.

### Impersonation Token System
```
Super Admin clicks "Log in as Owner"
→ Confirm modal shown first
→ POST /api/superadmin/gyms/:id/impersonate (requires protectSuperAdmin)
→ Backend generates 15-min JWT signed with IMPERSONATE_SECRET
  { purpose: "impersonate", ownerId, gymName, jti: randomHex }
→ Frontend redirects to /impersonate?token=<jwt>
→ ImpersonatePage calls POST /api/superadmin/exchange-impersonate (PUBLIC — no auth needed)
→ Backend checks: not expired + not already used (jti in-memory set) + purpose === "impersonate"
→ Marks token as used (single-use enforced), issues 4h owner session JWT with impersonated: true
→ setAuth(user, token) → navigate("/dashboard")
→ sessionStorage("gms:impersonating") = gymName
→ Orange support banner shows in OwnerLayout topbar
→ End Session → ConfirmModal → clearSession() → window.location.href = "/superadmin/dashboard"
```

**Key implementation notes:**
- `exchange-impersonate` is placed BEFORE `router.use(protectSuperAdmin)` — it must be public
- `exchange-impersonate` is rate limited: 10 requests/min per IP
- Impersonation tokens are **single-use** — jti stored in `usedTokens` Set, reuse rejected 401
- `setAuth` signature: `(user, token)` — user first, token second. Never swap.
- Impersonation only works on `status === "active"` gyms
- `ImpersonatePage` uses `useRef(false)` guard — StrictMode double-invoke fix
- End Session uses `window.location.href` NOT `navigate()` — avoids React render race with ProtectedRoute
- `clearSession()` in `authStore` — wipes state synchronously, no action-log POST (avoids race)
- `user.impersonated` on authStore — read by 401 interceptor to show "Support session ended" message

### Super Admin Audit Log (MongoDB)
- **Persistent** — survives server restarts (replaced in-memory array)
- Collection: `superadminauditlogs`
- Actions logged: `login`, `login_locked`, `gym_created`, `gym_suspended`, `gym_reactivated`, `gym_deleted`, `gym_hard_deleted`, `billing_updated`, `password_reset`, `invite_resent`, `impersonation_started`
- Each entry: `{ action, detail, ip, gymId?, timestamp }`
- Gym-specific actions include `gymId` for future per-gym filtering
- `logSa()` is fire-and-forget — `.catch()` logs to console, never throws
- Endpoint: `GET /api/superadmin/audit-log?action=X&gymId=Y&limit=N` (protected)

### Audit Log Viewer Page (`/superadmin/audit-log`)
- Dedicated page, protected by `SuperAdminRoute`
- Filters: action type dropdown, date from/to, gym/detail search
- Pagination: 50 entries per page with smart page numbers
- CSV export of current filtered results
- Back to dashboard link in topbar
- Both dashboard and audit log page have idle timeout hook

### Email Service (`emailService.ts`)
- **Nodemailer + Gmail SMTP** — replaced Resend (free tier restricted to verified emails only)
- Sender: `lakasgmsm@gmail.com` (App Password auth)
- Can send to **any email address** — not restricted like Resend free tier
- Gmail limit: 500 emails/day (sufficient until custom domain)
- `sendSetPasswordEmail` + `sendResetPasswordEmail` — same signatures as before
- When custom domain is ready: swap back to Resend SDK, change FROM to `noreply@yourdomain.com`
- Errors surfaced in API response — never silently swallowed

### Owner Onboarding Flow
```
Super Admin creates gym → User (isVerified: false) + GymClient + Settings created
→ Gmail sends invite → Owner clicks link → /set-password?token=...
→ Owner sets password → isVerified: true → redirected to /login
```

### Forgot Password Flow
```
Owner → /forgot-password → email sent → /reset-password?token=... → new password → /login
```

---

## Super Admin Dashboard — UI/UX Details

### Stats Row (6 cards)
Total Gyms / Active / Suspended / On Trial / Paid / **Expiring Soon**
- Each card has emoji icon + subtext (e.g. "X this week", "needs attention")
- Hover: `scale-[1.03]` + border brightens (premium feel)
- Loading: 6 `SkeletonCard` placeholders (animated pulse)

### Search & Filters
- Search input has 🔍 icon + ✕ clear button
- Filter chips: All / Active / Suspended / Deleted (each shows live count)
- "Clear filters" button appears when any filter is active
- Results count "X of Y gyms" shown right-aligned

### Table
- Column headers: Gym ID / Gym Name / Status / Billing / **Expiry** / Last Login
- Skeleton rows (5) during loading — replaces spinner
- Empty state: friendly UI with CTA "Add First Gym Client" when no gyms exist
- Zebra striping on alternating rows (subtle)
- Expiring rows (≤5 days) highlighted with amber background tint
- Copy ID button appears on row hover — shows "✓" for 1.5s after copy
- Address shown below email in gym cell when available
- Expiry column: "Xd left" (amber+pulse ≤5 days), "Expired" (red), "—" for non-trial

### Gym Detail Drawer
- Stats: Status, Billing, Last Login (amber `Never` badge if null), Joined, Trial Ends (color-coded), Billing Renews
- **Owner verification badge** — fetched from `GET /gyms/:id` on mount. Shows amber "⚠ Password not set" or green "✓ Verified"
- **Drawer re-syncs after Save** — `useEffect` on `gym` prop re-initializes local state when parent refreshes
- Billing status editor: trial / paid / overdue / cancelled
- **Next Renewal Date** date picker — visible only when `billingStatus === "paid"`, `min` = today
- Internal Notes + Save Changes
- Actions: 👤 Log in as Owner, 📧 Resend Invite, 🔑 Send Password Reset, Suspend/Reactivate, 🗑 Delete
- All action buttons have `ConfirmModal` before executing

### Modals
- **WelcomeModal** — shown once per login session via `sessionStorage("gms:sa-welcomed")`. Cleared on SA logout.
- **IdleWarningModal** — 60s countdown before auto-logout. Number turns red at ≤10s. "Stay Logged In" resets timer.
- All destructive actions use `ConfirmModal` (danger/warning variants)

### Keyboard Shortcuts
- `/` — focuses search input
- `Escape` — closes the gym detail drawer

### Topbar
- 📋 Audit Log button → navigates to `/superadmin/audit-log`
- Thin divider between Audit Log and Logout
- Logout hovers red

---

## Owner Layout — Impersonation Banner
- Orange banner appears when `sessionStorage("gms:impersonating")` is set
- Initialized via `useState(() => sessionStorage.getItem("gms:impersonating"))` — no useEffect needed
- "End Session" button → `ConfirmModal` → `clearSession()` + `window.location.href = "/superadmin/dashboard"`
- `clearSession()` used (not `logout()`) to avoid race condition with `ProtectedRoute`

---

## Idle Timeout (`useIdleTimeout.ts`)
- Location: `client/src/hooks/useIdleTimeout.ts`
- Watches: `mousemove`, `keydown`, `click`, `scroll`, `touchstart`
- Options: `idleMinutes`, `warningSeconds`, `onIdle`, `onWarn`, `onReset`
- Warning fires `warningSeconds` before logout → `onWarn` callback
- Any activity during warning → `onReset` callback (hides modal, resets timer)
- Used by: `SuperAdminDashboard` + `SuperAdminAuditLogPage` (both pages, 15 min / 60s warning)

---

## PWA Offline-First System

### Architecture (5 layers)
```
React UI → offlineQueue (IndexedDB) → syncManager → Service Worker → Render backend
```

### Key files
| File | Location | Purpose |
|------|----------|---------|
| `offlineQueue.ts` | `client/src/lib/` | IndexedDB wrapper. Stores pending actions |
| `syncManager.ts` | `client/src/lib/` | Watches navigator.onLine. Drains queue on reconnect. Retry 3x |
| `offlineService.ts` | `client/src/lib/` | Offline-aware wrappers. `offlineRenew()`. `checkWalkInDuplicate()` |
| `SyncBadge.tsx` | `client/src/components/` | Topbar badge showing pending/failed sync state |
| `sw.ts` | `client/src/` | Service Worker. Workbox precache + NetworkFirst/CacheFirst |

### Offline behavior
- Works offline: check-in/out, walk-in register/checkout, add member, at-risk member renewal (queued), view cached data
- Requires internet: log payments (disabled + amber banner), edit member, reports, settings, login
- 409 Conflict on sync = duplicate = treated as success, fires `gms:sync-duplicate` event
- Walk-in `gms:sync-duplicate` → amber info toast in `WalkInsPage`

### offlineService exports
- `offlineCheckIn(gymId, memberName)`
- `offlineCheckOut(gymId, memberName)`
- `offlineRenew(gymId, memberName, payload)`
- `offlineWalkInRegister(payload)`
- `offlineWalkInCheckOut(walkId, name, date?)` ← date param for History tab
- `checkWalkInDuplicate(name, phone?)`

### Offline cache (localStorage — per page)
| Key | Page | Content |
|-----|------|---------|
| `gms:dashboard-cache` | OwnerDashboard | memberStats, paymentSummary, walkInToday, atRisk, recentActivity, recentCheckins |
| `gms:staff-dashboard-cache` | StaffDashboard | membersInside, walkInsToday, totalCheckins, atRisk, todayLog |
| `gms:members-cache` | MembersPage | members list (unfiltered first page) |
| `gms:payments-cache` | PaymentsPage | payments list (unfiltered default) |
| `gms:payments-summary-cache` | PaymentsPage | summary cards |
| `gms:walkins-today-cache` | WalkInsPage | today's walk-ins + summary + yesterday stats |
| `gms:walkins-history-cache` | WalkInsPage | history (default week, unfiltered) |

---

## Auto Walk-out System

- `server/src/utils/autoCheckout.ts` — exports `runAutoCheckout()` + `initAutoCheckoutCron()`
- Called once in `server.ts` AFTER Settings init block
- Reads `Settings.closingTime` AND `Settings.timezone` — no hardcoded Asia/Manila
- `getTodayInTz(timezone)` replaces old `getTodayManila()`
- Manual trigger: `POST /api/walkin/auto-checkout` (owner only)
- Owner configures closing time + timezone in **Settings → Walk-in Day Passes**

---

## Timezone System

**All `Asia/Manila` hardcodes replaced with `Settings.timezone`.**

### Backend
- `Settings.ts` — `timezone: { type: String, default: "Asia/Manila" }`
- `autoCheckout.ts` — reads `Settings.timezone` for `getTodayInTz()` and cron option
- `authController.ts` — `getGymInfo` returns `timezone` and `ownerId`; `updateWalkInPrices` accepts + saves `timezone`
- `walkInController.ts` — `getTodayDate(ownerId?)` is **async**, reads `Settings.timezone` per gym; `getYesterdayRevenue` and `getWalkInHistory` default range also read `Settings.timezone`
- `paymentController.ts` — `getDateRange(range, timezone)` accepts timezone param; dynamically computes UTC offset (handles half-hour zones like UTC+5:30); `getPaymentSummary` reads `Settings.timezone` and passes it in; `getPayments` date filter uses `buildTzDateBounds(dateStr, timezone)` — reads gym's actual timezone from Settings

### Frontend
- `gymStore.ts` — `GymSettings.timezone`, `setTimezone()`, `getTimezone()` helper; also stores `ownerId`, `getOwnerId()` helper
- `WalkInsPage.tsx`, `PaymentsPage.tsx` — all date helpers use `gymStore.getTimezone()`
- `SettingsPage.tsx` — timezone dropdown (35 IANA options), saves via `PUT /api/auth/walkin-prices`
- `useClock.ts` — reads `gymStore.getTimezone()`

### Name collision
```typescript
const { setClosingTime: setStoreClosingTime, setTimezone: setStoreTimezone } = useGymStore();
```

---

## Live Clock (Topbar)

`useClock()` at `client/src/hooks/useClock.ts` — ticks every second, returns `{ timeStr, dateStr, isClosingSoon, closingLabel }`. Used by `OwnerLayout` and `StaffLayout`.

---

## Kiosk System

### Architecture
- URL: `/kiosk?gym=<ownerId>` — `ownerId` is the gym owner's `User._id`
- Auth: `X-Kiosk-Token` header (static secret from `.env`) + `X-Gym-Id` header (ownerId from URL param)
- No JWT. Machine-level auth only. Completely independent of owner/staff session.
- `kioskAuth` middleware validates both headers and attaches `req.kioskOwnerId`
- All 5 controller functions scope every DB query with `{ ownerId: req.kioskOwnerId }`

### Launch flow
```
Owner/Staff clicks 🖥 Kiosk button in dashboard
→ window.open("/kiosk?gym=<ownerId>", "_blank")
→ New tab — back button is dead (no history)
→ KioskPage reads ownerId from ?gym= param via useSearchParams
→ window.history.replaceState() kills any remaining history on mount
→ Every API call sends X-Gym-Id: <ownerId> and X-Kiosk-Token headers
→ kioskAuth validates token + extracts gymId → attaches req.kioskOwnerId
→ All queries scoped to that gym only
```

### Key kiosk rules
- `gymStore.getOwnerId()` — use this to build the kiosk URL from both owner and staff dashboards
- `buildKioskHeaders(ownerId)` — always use this function in KioskPage, never hardcode headers
- If `/kiosk` is opened without `?gym=`, shows a setup error screen — never queries globally
- Kiosk is independent of owner session — works even if owner logs out or token expires
- `X-Gym-Id` must be in `allowedHeaders` in `server/src/middleware/security.ts` for CORS preflight to pass
- Kiosk walk-in lookup uses `{ ownerId, walkId, isCheckedOut: false }` — NOT `{ walkId, date }`

---

## Settings Page

- Sections: Gym Info, Membership Plans, Walk-in Prices + Closing Time + Timezone, Account (Change Password)
- **Unsaved changes indicator** — amber pulsing dot + "Unsaved changes" appears when local state differs from gymStore
- **Logo upload hint** — "⚠ File selected — click Save Logo to upload" shown when file staged but not uploaded
- **Walk-in price validation** — prices must be > 0 before saving
- **Password show/hide toggles** — all three password fields have eye icon toggle
- **Password mismatch hint** — live inline error shown below confirm field before hitting save
- All Settings write endpoints use `req.user!.ownerId` (not `req.user!.id`)
- `/auth/gym-info` is a **protected** route — requires JWT. `gymStore.fetchGymInfo()` reads token from `localStorage("gms-auth")` and sends as Bearer header.

---

## Completed Features
- Role-based auth (owner / staff / super admin flows)
- MembersPage, WalkInsPage, WalkInDesk, PaymentsPage, OwnerDashboard, StaffDashboard
- ReportsPage — redesigned charts, PDF export
- SettingsPage — PlansManager, Walk-in Prices, Closing Time, Timezone, Change Password, unsaved indicators, logo hint, password toggles
- KioskPage — fully integrated, ownerId-scoped via X-Gym-Id, history guard, error screen for missing ?gym= param
- Kiosk launch button — 🖥 Kiosk in both OwnerDashboard and StaffDashboard header
- Global toast system, confirm modals via createPortal
- Cloudinary logo upload, UptimeRobot ping
- Action Log system — full audit trail, role isolation, ownerId-scoped
- Offline-first PWA — SW, IndexedDB queue, syncManager, SyncBadge, optimistic UI
- MembersPage offline cache — `gms:members-cache`, amber banner, auto-refresh on reconnect, 30s poll paused offline, Array.isArray guards
- Super Admin system — GymClient model, auth, email invite, dashboard, full CRUD
- Auto walk-out — cron at closing time using `Settings.timezone`, manual trigger
- Live clock — `useClock()` hook, both layouts, closing time warning
- Owner password flows — set-password (invite), forgot-password, reset-password
- Gym suspension enforcement — kicks owner + all staff immediately
- Login rate limiting — 5 attempts → 15-min lockout (owner/staff by identifier, Super Admin by IP)
- Forced logout message — `sessionStorage("gms:logout-reason")`
- Offline cache — all pages cached with amber banner + auto-refresh
- Offline renew — at-risk renewal queued in both dashboards
- Timezone setting — `Settings.timezone` replaces all Asia/Manila hardcodes
- Impersonation token — single-use, rate limited, StrictMode-safe, 4h session
- Super Admin security hardening — rate limiting, timing-safe comparison, IP sanitization, billingStatus validation
- Super Admin audit log — MongoDB persistent, viewer page with filters + CSV export
- SA branding hardcoded — `"⚡ SuperAdmin - LakasGMS"` in topbar + login + browser tab via `document.title`
- Idle timeout — 15 min, 60s warning modal on SA pages
- gymStore `ownerId` + `getOwnerId()` — fetched from `/auth/gym-info`, used for kiosk URL
- CORS `allowedHeaders` includes `X-Gym-Id`
- LoginPage — removed Kiosk link; kiosk only accessible from dashboard
- Settings `logoUrl`/`logoPublicId` typed as `string | null` (matches Mongoose schema)
- `gymStore.resetStore()` — resets `hasFetched` on logout so next login fetches fresh settings

---

## Known Bugs Fixed (all sessions)
- Walk-in double registration → removed redundant call in StaffDashboard
- Walk-in missing 10-second duplicate guard → added
- `gms:sync-duplicate` not handled for walk-ins → listener added in WalkInsPage
- Staff JWT was 7 days → reduced to 12 hours
- Suspended owner not kicked until token expired → `protect` now checks live DB
- Set/reset password auto-logged in owner → removed, redirects to /login
- `GymClient.lastLoginAt` never updated → added to `loginOwner`
- Orphaned `User` if `GymClient.create` failed → rollback added
- Email errors silently swallowed → surfaced in API response
- `gymStore.GymSettings` missing `closingTime` → added
- `setClosingTime` name collision → aliased as `setStoreClosingTime`
- `autoCheckout.ts` TS2503 → named import `ScheduledTask`
- Walk-in history checkout → 404 → `date` passed through full stack
- `isOffline` at module level (hook violation) → moved inside component
- `offlineRenew` not implemented → fixed in StaffRenewModal + RenewModal
- Impersonation redirect to `/login` → `setAuth` arguments were swapped, fixed
- `hardDeleteGym` orphaned Settings → now deletes by `ownerId` not `gymName`
- Super Admin login had no rate limiting → added IP-based 5-attempt lockout
- Impersonation token reusable → fixed with `jti` + `usedTokens` Set
- Impersonation session 15m too short → changed to 4h
- Impersonation End Session went to /login → fixed with `window.location.href` + `clearSession()`
- `setState` in useEffect (idle banner) → fixed with lazy `useState` initializer
- `Property 'impersonated' does not exist on type 'User'` → added `impersonated?: boolean` to User type
- Deleted gyms filter broken → `listGyms` now returns all gyms, frontend filters
- `SuperAdminAuditLog.ts` filename casing mismatch on Windows → rename via temp file
- Resend free tier blocked non-verified emails → swapped to Nodemailer + Gmail SMTP
- `createPayment` member lookup missing `ownerId` → Gym A could mutate Gym B's member → fixed with `{ ownerId, gymId }` filter
- `getPassAmount` used `Settings.findOne({})` → all gyms got first gym's walk-in prices → fixed with `{ ownerId }` filter
- `generateWalkId` missing `ownerId` → WALK-XXX counter was globally shared → fixed; WalkIn unique index updated to `{ ownerId, date, walkId }`
- `generateGymId` missing `ownerId` → GYM-XXXX counter was globally shared → fixed with `generateGymId(ownerId)`
- Payment duplicate guards missing `ownerId` → fixed on both `createPayment` and `settleBalance`
- `getTodayDate()` hardcoded `Asia/Manila` in walkInController → made async, reads `Settings.timezone` per gym
- `getDateRange()` hardcoded `Asia/Manila` in paymentController → now accepts `timezone` param
- `getYesterdayRevenue` + `getWalkInHistory` hardcoded `Asia/Manila` → read `Settings.timezone`
- `autoExpireMembers()` had no `ownerId` filter → expired members across ALL gyms → fixed with `autoExpireMembers(ownerId)`
- `createMember` gymId collision check was global → scoped to `{ ownerId, gymId }`
- `getPlanPrice` / `getPlanDuration` `{}` fallback leaked first gym's settings → removed fallback
- `getPayments` date filter hardcoded Manila offset → replaced with `buildTzDateBounds(dateStr, tz)`
- `autoLogPayment` `processedBy` plain string → cast to ObjectId; `populate("processedBy")` was silently failing
- `/auth/gym-info` was public → `req.user` always undefined → route now protected; gymStore sends JWT
- All Settings fns used `req.user!.id` → changed to `req.user!.ownerId`
- `updateGym` + `uploadLogoController` had `upsert: true` → removed; hard error if Settings missing
- `gymStore.hasFetched` never reset on logout → `resetStore()` added
- `gymStore` missing `ownerId` → added to interface + fetchGymInfo + `getOwnerId()` helper
- `getGymInfo` not returning `ownerId` → added to response
- `Settings.ts` interface `logoUrl`/`logoPublicId` typed as `string | undefined` → changed to `string | null`
- Kiosk queries had no `ownerId` scoping → all 5 controller functions now scoped; `kioskAuth` extracts `X-Gym-Id`
- `X-Gym-Id` header blocked by CORS preflight → added to `allowedHeaders` in `security.ts`
- `MembersPage` white screen offline → `fetchMembers` had no offline handling; `res.members` could be undefined → added cache read, Array.isArray guards, offline banner
- `useEffect` for online/offline listeners in `MembersPage` referenced `fetchMembers` before declaration → moved `isOffline` state up; effect placed after `fetchMembers`
- SA topbar showed "LakasGMS Control" → hardcoded to "⚡ SuperAdmin - LakasGMS" across all 3 SA pages
- Browser tab showed "LakasGMS" on SA pages → `document.title` set in `useEffect` on all SA pages
- LoginPage had `Kiosk ➜` link → removed; kiosk only accessible from dashboard

---

## Pending / Next Up
1. **Render Starter upgrade** — $7/mo for static IP before selling
2. **PayMongo integration** — webhook auto-updates billingStatus + billingRenewsAt
3. **Custom domain** — needed for professional email sender (currently using Gmail SMTP)
4. **Members/Payments summary in SA drawer** — now unblocked (ownerId scoping is complete); needs aggregate queries in superAdminController
5. **Super Admin audit log TTL** — enable 1-year auto-expiry (commented out in model)
6. **WalkIn index migration** — run `npx ts-node src/script/migrate-walkin-index.ts` once on Atlas to drop old `walkId_1` unique index and create `{ ownerId, date, walkId }` compound index

---

## Environment Variables

```env
# server/.env (never commit)
PORT=5000
MONGO_URI=your_mongodb_atlas_uri
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
KIOSK_SECRET=32+char_random_hex
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
NODE_ENV=production

# Super Admin (never commit)
SUPER_JWT_SECRET=long-random-string-32-chars-min
SUPER_ADMIN_EMAIL=your@email.com
SUPER_ADMIN_PASSWORD=strong-password

# Impersonation (never commit)
IMPERSONATE_SECRET=long-random-string-32-chars-min

# Email via Gmail SMTP (never commit)
GMAIL_USER=lakasgmsm@gmail.com
GMAIL_APP_PASSWORD=your_16char_app_password_no_spaces

# Frontend URL (never commit)
CLIENT_URL=https://ironcore-gms.onrender.com

# client/.env.local (local dev only — never commit)
VITE_API_URL=http://localhost:5000
VITE_KIOSK_SECRET=same_value_as_KIOSK_SECRET

# client env vars on Render (production)
VITE_API_URL=https://ironcore-gms-server.onrender.com
VITE_KIOSK_SECRET=same_value_as_KIOSK_SECRET
```

---

## Dev Notes
- Tailwind v4: spacing via `style={{}}` only — no `p-4`, `mt-2`, etc.
- Babel issue: avoid `.reduce<T>()` generic syntax in TSX files
- Express 5: no express-mongo-sanitize — manual sanitizer in place
- Member ≠ User — never conflate these two models
- Member/Payment/WalkIn/ActionLog ALL have `ownerId` — every query must include `ownerId` filter
- `protect` is now async — adds ~2-10ms per request (isActive + GymClient suspension check)
- `authStore` persist key: `gms-auth` | `superAdminStore` persist key: `gms-superadmin`
- `gymStore.triggerMemberRefresh()` → `lastMemberUpdate: Date.now()` → `MembersPage` refetches
- **`gymStore.getTimezone()`** — use this everywhere instead of hardcoding `"Asia/Manila"`
- **`gymStore.getOwnerId()`** — use this for kiosk URL; works for both owners and staff
- `useClock.ts` — `client/src/hooks/useClock.ts`, reads timezone from gymStore
- `useIdleTimeout.ts` — `client/src/hooks/useIdleTimeout.ts`, used by SA pages only
- Expiry extension: if `member.expiresAt > now` → extend from expiry; else extend from today
- Kiosk uses raw `fetch()` with `X-Kiosk-Token` + `X-Gym-Id` — NOT Axios `api` instance
- `syncManager` is singleton — call `syncManager.init()` once in `App.tsx`
- SW only registers in production build (`npm run build && npm run preview`)
- `logAction()` is fire-and-forget with try/catch — never crashes routes
- `logSa()` is fire-and-forget with `.catch()` — never crashes SA routes
- `initAutoCheckoutCron()` must be called AFTER Settings init block in `server.ts`
- Gmail SMTP: 500 emails/day limit — sufficient until custom domain + Resend swap
- Super Admin route: `/superadmin` — not linked anywhere in public UI
- Owner email is immutable after creation — only Super Admin can manage it
- Name collision fix: `const { setClosingTime: setStoreClosingTime, setTimezone: setStoreTimezone } = useGymStore()`
- `ALLOWED_ORIGINS` in `config/security.ts` must include both Render URLs
- `allowedHeaders` in `middleware/security.ts` must include `X-Kiosk-Token` AND `X-Gym-Id`
- `sessionStorage("gms:logout-reason")` — written by api.ts 401 interceptor, read + cleared by LoginPage
- `sessionStorage("gms:impersonating")` — written by ImpersonatePage on successful exchange, value = gymName
- `sessionStorage("gms:sa-welcomed")` — written on SA welcome modal dismiss, cleared on SA logout
- `authStore.setAuth` signature: `(user, token)` — user object first, token string second. Never swap.
- `authStore.clearSession()` — synchronous state clear, no action-log POST. Use for End Session only.
- `exchange-impersonate` must be PUBLIC (before `router.use(protectSuperAdmin)`) — token IS the credential
- Super Admin login rate limit keyed by IP (only one SA account exists)
- Impersonation tokens single-use — `jti` in JWT payload, added to `usedTokens` Set on exchange, reuse = 401
- `hardDeleteGym` deletes User + GymClient + Settings (by `ownerId`) — all three, never just two
- Windows filename casing: rename via temp file when changing casing
- `ImpersonatePage` uses `useRef(false)` guard — React StrictMode double-invokes effects, consuming single-use token
- End Session uses `window.location.href` not `navigate()` — React Router render race causes redirect to /login otherwise
- `generateGymId(ownerId)` — always pass ownerId; sequences are per-gym, not global
- `generateWalkId(today, ownerId)` — always pass both; WALK-XXX counter is per-gym-per-day
- `getPassAmount(passType, ownerId)` — always pass ownerId; reads the correct gym's walkInPrices from Settings
- `getTodayDate(ownerId?)` in walkInController is **async** — always `await` it; pass `req.user!.ownerId`
- `getDateRange(range, timezone)` in paymentController — requires timezone string
- `buildTzDateBounds(dateStr, timezone)` in paymentController — use for YYYY-MM-DD filter strings to UTC Date bounds
- `autoExpireMembers(ownerId)` in memberController — always pass ownerId; never call without it
- `getPlanPrice(name, cache, ownerId)` / `getPlanDuration(name, cache, ownerId)` — always pass ownerId as third arg
- `autoLogPayment({ processedBy })` — processedBy is a string userId; cast to ObjectId inside. Never pass ObjectId directly.
- Kiosk walk-in lookup uses `{ ownerId, walkId, isCheckedOut: false }` — NOT `{ walkId, date }`
- WalkIn unique index is `{ ownerId, date, walkId }` — NOT global `{ walkId }`. Run `migrate-walkin-index.ts` on Atlas.
- Migration scripts: `server/src/script/migrate-add-ownerid.ts` + `server/src/script/migrate-walkin-index.ts`
- **`ownerId` source chain** — `owner._id` (created by SA) = `GymClient.ownerId` = `Settings.ownerId` = JWT `id` field = `req.user!.ownerId` (set by `protect`). No GymClient lookup needed in controllers.
- Owner `User` documents have no `ownerId` field in MongoDB (absent, not null). Staff documents have `ownerId: ObjectId`.
- `registerStaff` uses `new mongoose.Types.ObjectId(req.user!.id)` for staff `ownerId`. Follow this pattern for all `ownerId` writes.
- Settings is **per-gym** — never `Settings.findOne({})` without ownerId; never upsert
- **React hook ordering rule:** all `useState` → store hooks → computed values → `useCallback` → `useEffect`. Never reference a `useCallback` result before it is declared.
