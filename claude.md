# Gym Management System — CLAUDE.md

## Project Overview
Full-stack gym management system with role-based access for owners, staff, and members.

**GitHub:** HarryBing162000/gym-management-system
**Deployed:** Render (frontend + backend)
**Frontend URL:** https://ironcore-gms.onrender.com
**Backend URL:** https://ironcore-gms-server.onrender.com
**Generalized name:** Gym Management System (do NOT hardcode "IronCore" anywhere in code)

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

### ID Schemes
- Members: `GYM-XXXX` (auto-generated, sequential)
- Walk-ins: `WALK-XXX` (daily-resetting, resets each day)
- Gym clients: `GYM-001` format (sequential, via `generateGymClientId()`)

### Key Zustand Stores
| Store              | Responsibility |
|--------------------|----------------|
| `authStore`        | Current user session, role, JWT token. `logout()` fires POST /api/action-logs/logout BEFORE clearing token. Persist key: `gms-auth`. `setAuth(user, token)` — user first, token second |
| `gymStore`         | Settings + plans + walkInPrices + closingTime + **timezone**. `triggerMemberRefresh()`. `setClosingTime()`. `setTimezone()`. `getTimezone()` helper |
| `toastStore`       | Global toast notifications |
| `superAdminStore`  | Super admin session, separate token. Persist key: `gms-superadmin` |

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
- **`ownerId`** — staff only, set at creation. Links staff → owner's GymClient for gym suspension check

### Member
- Hard duplicate blocking on: name, email, phone
- ID format: `GYM-XXXX`
- `balance` field tracks outstanding unpaid amount
- `checkedIn` + `lastCheckIn` for real-time presence tracking

### GymClient
- One per gym enrolled by Super Admin
- Fields: `gymClientId` (GYM-001), `gymName`, `contactEmail`, `ownerId`, `status`, `billingStatus`, `trialEndsAt`, `billingRenewsAt`, `notes`, `lastLoginAt`
- `status`: `active` | `suspended` | `deleted`
- `billingStatus`: `trial` | `paid` | `overdue` | `cancelled`
- `lastLoginAt` — updated on every owner login via `GymClient.findOneAndUpdate({ ownerId }, { lastLoginAt: new Date() })` in `loginOwner` (fire-and-forget)
- `billingRenewsAt` — set manually by Super Admin when recording a client's monthly payment

### WalkIn
- Fields: `passType`, `amount`, `checkIn`, `checkOut`, `staffId`, **`date`** (YYYY-MM-DD string in gym timezone)
- Pass types: Regular, Student, Couple
- IDs reset daily: `WALK-XXX`
- **Duplicate guards:** same-name today (409) + 10-second rapid-fire guard
- **Auto walk-out:** `runAutoCheckout()` called by cron at `Settings.closingTime` in `Settings.timezone`
- **History checkout:** `PATCH /api/walkin/checkout` accepts optional `date` body param for past-day records

### Payment
- Fields: `method`, `type`, `amountPaid`, `balance`, `isPartial`, `processedBy`
- Types: `new_member`, `renewal`, `manual`, `balance_settlement`
- Duplicate guard: 10 seconds
- Backend aggregate returns `grandTotal`, `cashTotal`, `onlineTotal`

### ActionLog
- Fields: `action` (enum), `performedBy` ({ userId, name, role }), `targetId`, `targetName`, `detail`, `timestamp`
- Indexes: `{ timestamp: -1 }` and `{ 'performedBy.userId': 1, timestamp: -1 }`

### Settings
- Singleton document
- `timezone: string` (default `"Asia/Manila"`)

---

## Super Admin System

### Auth
- Credentials in env (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`) — no DB record
- Separate JWT signed with `SUPER_JWT_SECRET`
- Protected by `protectSuperAdmin` middleware
- Frontend: `/superadmin` (hidden route, not linked anywhere in public UI)
- **Rate limited:** 5 wrong attempts → 15-min lockout by IP address
- **Timing-safe comparison:** `crypto.timingSafeEqual()` used for credential check

### Capabilities
- Create gym client + owner account → sends set-password invite email via Resend
- List / view / edit gym clients (search + filter: All / Active / Suspended / Deleted)
- Suspend / reactivate / soft-delete / hard-delete gym
- Reset owner password (sends reset email)
- Resend invite email
- Track last login per gym (`lastLoginAt`)
- **Impersonate owner** — 15-min scoped support session (single-use token)
- **Billing lifecycle** — change billingStatus, set `billingRenewsAt` when client pays monthly
- **Audit log** — `GET /api/superadmin/audit-log` (last 200 entries, in-memory)

### Billing Renewal Flow (manual — pre-PayMongo)
```
Client pays monthly → Super Admin opens gym drawer
→ Set billingStatus = "paid"
→ Set Next Renewal Date = next month's date
→ Save Changes
```
Future: PayMongo webhook auto-updates `billingStatus` + `billingRenewsAt`.

### Impersonation Token System
```
Super Admin clicks "Log in as Owner"
→ POST /api/superadmin/gyms/:id/impersonate (requires protectSuperAdmin)
→ Backend generates 15-min JWT signed with IMPERSONATE_SECRET
  { purpose: "impersonate", ownerId, gymName, jti: randomHex }
→ Frontend redirects to /impersonate?token=<jwt>
→ ImpersonatePage calls POST /api/superadmin/exchange-impersonate (PUBLIC — no auth needed)
→ Backend checks: not expired + not already used (jti in-memory set) + purpose === "impersonate"
→ Marks token as used (single-use enforced), issues real 15-min owner session JWT
→ setAuth(user, token) → navigate("/dashboard")
→ sessionStorage("gms:impersonating") = gymName
```

**Key implementation notes:**
- `exchange-impersonate` is placed BEFORE `router.use(protectSuperAdmin)` — it must be public
- `exchange-impersonate` is rate limited: 10 requests/min per IP
- Impersonation tokens are **single-use** — jti stored in `usedTokens` Set, reuse rejected 401
- `setAuth` signature: `(user, token)` — user first, token second. Never swap.
- Impersonation only works on `status === "active"` gyms
- Session JWT expires in 15 min

### Super Admin Audit Log
- In-memory, last 200 entries (auto-trimmed). **Resets on server restart.**
- Actions logged: `login`, `login_locked`, `gym_created`, `gym_suspended`, `gym_reactivated`, `gym_deleted`, `gym_hard_deleted`, `billing_updated`, `password_reset`, `invite_resent`, `impersonation_started`
- Each entry: `{ action, detail, ip, timestamp }`
- Endpoint: `GET /api/superadmin/audit-log` (protected)
- **TODO:** migrate to MongoDB for persistence before selling

### Email Service (`emailService.ts`)
- Resend SDK — `sendSetPasswordEmail` + `sendResetPasswordEmail`
- Sender: `onboarding@resend.dev` (change to `noreply@yourdomain.com` after custom domain)
- Set-password link expires 24h, reset link expires 1h
- Errors are caught and surfaced in API response — never silently swallowed

### Owner Onboarding Flow
```
Super Admin creates gym → User (isVerified: false) + GymClient + Settings created
→ Resend sends invite → Owner clicks link → /set-password?token=...
→ Owner sets password → isVerified: true → redirected to /login
```

### Forgot Password Flow
```
Owner → /forgot-password → email sent → /reset-password?token=... → new password → /login
```

---

## Super Admin Dashboard — UI/UX Details

### Stats Row (6 cards)
Total Gyms / Active / Suspended / On Trial / Paid / **Expiring Soon** (orange — trials ending ≤7 days, shows ✓ when 0)

### Gym List Row Indicators
- **Billing column:** `⚠` amber icon next to billing badge if trial expires within 7 days
- **Last Login column:** amber `Never` badge if `lastLoginAt` is null
- **Status filter:** All / Active / Suspended / Deleted

### Keyboard Shortcuts
- `/` — focuses search input
- `Escape` — closes the gym detail drawer

### Gym Detail Drawer
- Stats: Status, Billing, Last Login (amber `Never` badge if null), Joined, Trial Ends (color-coded), Billing Renews
- Billing status editor: trial / paid / overdue / cancelled
- **Next Renewal Date** date picker — visible only when `billingStatus === "paid"`, used to record monthly payments
- Internal Notes + Save Changes
- Actions: 👤 Log in as Owner, 📧 Resend Invite, 🔑 Send Password Reset, Suspend/Reactivate, 🗑 Delete

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
| `gms:payments-cache` | PaymentsPage | payments list (unfiltered default) |
| `gms:payments-summary-cache` | PaymentsPage | summary cards |
| `gms:walkins-today-cache` | WalkInsPage | today's walk-ins + summary + yesterday stats |
| `gms:walkins-history-cache` | WalkInsPage | history (default week, unfiltered) |

Cache written on successful online fetch, read when `navigator.onLine` is false. Amber banner shown offline. Auto-refreshes on reconnect.

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
- `authController.ts` — `getGymInfo` returns `timezone`; `updateWalkInPrices` accepts + saves `timezone`
- `walkInController.ts` — `getTodayDate()` reads `Settings.timezone`

### Frontend
- `gymStore.ts` — `GymSettings.timezone`, `setTimezone()`, `getTimezone()` helper
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

## Walk-in History Checkout Fix

Root cause: `checkOutWalkIn` filtered by `{ walkId, date: today }` — past records not found. Fix: `date` passed through full stack (`walkInController` → `walkInService` → `offlineService` → `WalkInsPage`).

---

## Completed Features
- Role-based auth (owner / staff / super admin flows)
- MembersPage, WalkInsPage, WalkInDesk, PaymentsPage, OwnerDashboard, StaffDashboard
- ReportsPage — redesigned charts, PDF export
- SettingsPage — PlansManager, Walk-in Prices, Closing Time, Timezone, Change Password
- KioskPage — fully integrated, rate limited, X-Kiosk-Token auth
- Global toast system, confirm modals via createPortal
- Cloudinary logo upload, UptimeRobot ping
- Action Log system — full audit trail, role isolation
- Offline-first PWA — SW, IndexedDB queue, syncManager, SyncBadge, optimistic UI
- Super Admin system — GymClient model, auth, email invite, dashboard, full CRUD
- Auto walk-out — cron at closing time using `Settings.timezone`, manual trigger
- Live clock — `useClock()` hook, both layouts, closing time warning
- Owner password flows — set-password (invite), forgot-password, reset-password
- Gym suspension enforcement — kicks owner + all staff immediately
- Login rate limiting — 5 attempts → 15-min lockout (owner/staff by identifier, Super Admin by IP)
- Forced logout message — `sessionStorage("gms:logout-reason")`
- Walk-in Action column — Check Out on both Today and History tabs
- Walk-in history checkout fix — `date` passed through full stack
- Offline cache — all pages cached with amber banner + auto-refresh
- Offline renew — at-risk renewal queued in both dashboards
- Timezone setting — `Settings.timezone` replaces all Asia/Manila hardcodes
- `lastLoginAt` fix — `GymClient.findOneAndUpdate` added to `loginOwner`
- Impersonation token — 15-min support session, single-use, rate limited
- Super Admin security hardening — rate limiting, timing-safe comparison, single-use tokens, Settings cleanup on hard delete
- Super Admin audit log — in-memory last 200 entries, `GET /api/superadmin/audit-log`
- Super Admin UX — billing renewal date picker, Never badge, trial expiry ⚠, Escape closes drawer, `/` focuses search, Expiring Soon card

---

## Known Bugs Fixed (latest sessions)
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
- Impersonation redirect to `/login` → `setAuth` arguments were swapped, fixed to `setAuth(data.user, data.token)`
- `hardDeleteGym` orphaned Settings → now deletes User + GymClient + Settings
- Super Admin login had no rate limiting → added IP-based 5-attempt lockout
- Impersonation token reusable → fixed with `jti` + `usedTokens` Set (single-use)

---

## Git Rules (CRITICAL)
- **Never commit:** `dist/`, `.env`, `*.env.*`, `*.http`, `node_modules/`
- Root `.gitignore` uses `**/node_modules/` with Unix line endings (CRLF breaks pattern matching)
- Secrets go in Render environment variables ONLY
- Server `dist/` is built by Render on deploy — never committed
- Safe to use `git add .` — root `.gitignore` with `**/` patterns handles all subdirectories
- Render build command: `npm install --include=dev && npm run build`

---

## Pending / Next Up
1. **Render Starter upgrade** — $7/mo for static IP before selling
2. **Impersonation support banner** — owner dashboard orange banner when `sessionStorage("gms:impersonating")` is set
3. **Super Admin audit log persistence** — migrate from in-memory to MongoDB (survives server restarts)
4. **PayMongo integration** — webhook auto-updates billingStatus + billingRenewsAt

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

# Email via Resend (never commit)
RESEND_API_KEY=re_your_key
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
- `protect` is now async — adds ~2-10ms per request (isActive + GymClient suspension check)
- `authStore` persist key: `gms-auth` | `superAdminStore` persist key: `gms-superadmin`
- `gymStore.triggerMemberRefresh()` → `lastMemberUpdate: Date.now()` → `MembersPage` refetches
- **`gymStore.getTimezone()`** — use this everywhere instead of hardcoding `"Asia/Manila"`
- `useClock.ts` — `client/src/hooks/useClock.ts`, reads timezone from gymStore
- Expiry extension: if `member.expiresAt > now` → extend from expiry; else extend from today
- Kiosk uses raw `fetch()` with `X-Kiosk-Token` — NOT Axios `api` instance
- `syncManager` is singleton — call `syncManager.init()` once in `App.tsx`
- SW only registers in production build (`npm run build && npm run preview`)
- `logAction()` is fire-and-forget with try/catch — never crashes routes
- `initAutoCheckoutCron()` must be called AFTER Settings init block in `server.ts`
- Resend free plan: can only send to your own verified email without a custom domain
- Super Admin route: `/superadmin` — not linked anywhere in public UI
- Owner email is immutable after creation — only Super Admin can manage it
- Name collision fix: `const { setClosingTime: setStoreClosingTime, setTimezone: setStoreTimezone } = useGymStore()`
- `ALLOWED_ORIGINS` in `config/security.ts` must include both Render URLs
- `sessionStorage` key `gms:logout-reason` — written by api.ts 401 interceptor, read + cleared by LoginPage
- `sessionStorage` key `gms:impersonating` — written by ImpersonatePage on successful exchange, value = gymName
- Offline cache seeded only after successful online fetch — visit pages online first if cache appears null
- `authStore.setAuth` signature: `(user, token)` — user object first, token string second. Never swap.
- `exchange-impersonate` must be PUBLIC (before `router.use(protectSuperAdmin)`) — token IS the credential
- Super Admin login rate limit keyed by IP (only one SA account exists)
- Impersonation tokens single-use — `jti` in JWT payload, added to `usedTokens` Set on exchange, reuse = 401
- `hardDeleteGym` must delete User + GymClient + Settings — all three, never just two
- Super Admin audit log is in-memory only — resets on server restart, migrate to MongoDB before production
