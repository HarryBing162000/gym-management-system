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
| Super Admin | Email (env only)  | 12 hours     | Separate JWT secret                |
| Member      | Auto GYM-XXXX ID  | —            | Gym client, separate from User     |

- `User` model → owner + staff authentication
- `Member` model → gym clients (intentionally separate from User)
- `GymClient` model → one document per gym enrolled via Super Admin
- JWT middleware (`protect`) on all protected routes — **now async with live DB isActive check**
- `AuthRequest` extends `Request` with `user: { id, role, name }`
- `requireRole(...roles)` for role-based access control
- **Auto-logout:** `protect` checks `isActive` on every request — suspend gym or deactivate staff kicks them out immediately

### Token System
- `generateOwnerToken()` → 7 days (JWT_SECRET)
- `generateStaffToken()` → 12 hours (JWT_SECRET)
- `superAdminLogin` → 12 hours (SUPER_JWT_SECRET — separate secret)
- Set/reset password tokens → 24h / 1h (JWT_SECRET, purpose field)

### ID Schemes
- Members: `GYM-XXXX` (auto-generated, sequential)
- Walk-ins: `WALK-XXX` (daily-resetting, resets each day)
- Gym clients: `GYM-001` format (sequential, via `generateGymClientId()`)

### Key Zustand Stores
| Store              | Responsibility |
|--------------------|----------------|
| `authStore`        | Current user session, role, JWT token. `logout()` fires POST /api/action-logs/logout BEFORE clearing token |
| `gymStore`         | Plans + walk-in prices + closingTime helpers. `lastMemberUpdate` + `triggerMemberRefresh()` for cross-page refresh signal |
| `toastStore`       | Global toast notifications |
| `superAdminStore`  | Super admin session, separate token, persisted as `gms-superadmin` |

### Settings (Single Source of Truth)
- `Settings.gymName`, `Settings.gymAddress`, `Settings.logoUrl` (Cloudinary)
- `Settings.plans[]` — membership plans (drives PlansManager)
- `Settings.walkInPrices` — walk-in pass pricing
- `Settings.closingTime` — "HH:mm" 24h format, Manila time (default "22:00")

---

## Data Models

### User
- Roles: `owner` | `staff`
- Owner login: email. Staff login: username
- Fields: `isActive`, `isVerified`, `passwordResetToken`, `passwordResetExpires`
- `isVerified: false` until owner clicks set-password email link from Super Admin invite

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
- `lastLoginAt` updated on every owner login via `loginOwner`

### WalkIn
- Fields: `passType`, `amount`, `checkIn`, `checkOut`, `staffId`
- Pass types: Regular, Student, Couple (different pricing)
- Dual checkout: staff counter + public kiosk
- IDs reset daily: `WALK-XXX`
- **Duplicate guards:** same-name today (409) + 10-second rapid-fire guard (same pattern as Payment)
- **Auto walk-out:** `runAutoCheckout()` called by cron at `Settings.closingTime` daily

### Payment
- Fields: `method`, `type`, `amountPaid`, `balance`, `isPartial`, `processedBy`
- Types: `new_member`, `renewal`, `manual`, `balance_settlement`
- Duplicate guard: 10 seconds
- `settleBalance` uses outstanding balance as `totalAmount`, not plan price
- Expiry extension: calculates from `member.expiresAt` (not today) if still active
- Backend aggregate returns `grandTotal`, `cashTotal`, `onlineTotal` — no limit

### ActionLog
- Fields: `action` (enum), `performedBy` ({ userId, name, role }), `targetId`, `targetName`, `detail`, `timestamp`
- Indexes: `{ timestamp: -1 }` and `{ 'performedBy.userId': 1, timestamp: -1 }`
- All filters (role, staffId, action, date) applied server-side

---

## Super Admin System

### Auth
- Credentials stored in env (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`) — no DB record
- Separate JWT signed with `SUPER_JWT_SECRET`
- Protected by `protectSuperAdmin` middleware
- Login route: `POST /api/superadmin/login`
- Frontend: `/superadmin` (hidden route, not linked anywhere in public UI)

### Capabilities
- Create gym client + owner account → sends set-password invite email via Resend
- List / view / edit gym clients
- Suspend / reactivate / soft-delete / hard-delete gym
- Reset owner password (sends reset email)
- Resend invite email
- Track last login per gym

### Email Service (`emailService.ts`)
- Resend SDK — `sendSetPasswordEmail` + `sendResetPasswordEmail`
- Sender: `onboarding@resend.dev` (change to `noreply@yourdomain.com` after adding custom domain)
- Set-password link expires 24h, reset link expires 1h
- Errors are caught and surfaced in API response — never silently swallowed

### Owner Onboarding Flow
```
Super Admin creates gym → User created (isVerified: false, random placeholder password)
→ Resend sends "Set your password" email → Owner clicks link → /set-password?token=...
→ Owner sets password → isVerified: true → redirected to /login → owner logs in manually
```

### Forgot Password Flow
```
Owner clicks "Forgot password?" on /login → enters email
→ POST /api/auth/forgot-password → Resend sends reset link (1h expiry)
→ Owner clicks link → /reset-password?token=... → sets new password → redirected to /login
```

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
| `offlineService.ts` | `client/src/lib/` | Offline-aware wrappers for write actions |
| `SyncBadge.tsx` | `client/src/components/` | Topbar badge showing pending/failed sync state |
| `sw.ts` | `client/src/` | Service Worker. Workbox precache + NetworkFirst/CacheFirst |

### Offline behavior
- Works offline: check-in/out, walk-in register/checkout, add member, view cached data
- Requires internet: payments, edit member, reports, settings, login
- 409 Conflict on sync = duplicate = treated as success, fires `gms:sync-duplicate` event
- Walk-in 409 on sync → fires `gms:sync-duplicate` with `url.includes("/walkin/register")` → friendly amber toast

---

## Auto Walk-out System

### How it works
- `autoCheckout.ts` in `server/src/utils/` — exports `runAutoCheckout()` + `initAutoCheckoutCron()`
- Cron reads `Settings.closingTime` on server startup, schedules daily job in Manila timezone
- `runAutoCheckout()` finds all `WalkIn` with `isCheckedOut: false` for today → sets `isCheckedOut: true`, `checkOut = closing time`
- Manual trigger: `POST /api/walkin/auto-checkout` (owner only)
- Wire in `server.ts`: call `await initAutoCheckoutCron()` after Settings init block

### Closing time configuration
- Owner sets closing time in **Settings → Walk-in Day Passes** section
- Stored as `Settings.closingTime` ("HH:mm" format, 24h, Manila time)
- Default: `"22:00"` (10:00 PM)
- Frontend `gymStore` exposes `settings.closingTime`
- Live clock in topbar shows `⚠ Closes HH:MM AM/PM` warning when within 30 minutes of closing

---

## Live Clock (Topbar)

Both `OwnerLayout` and `StaffLayout` include a `useClock(closingTime?)` hook:
- Ticks every second via `setInterval`
- Shows live time + date in Manila timezone
- Shows amber `⚠ Closes X:XX PM` badge when within 30 minutes of `Settings.closingTime`
- Reads `closingTime` from `gymStore.settings.closingTime`

---

## Completed Features
- Role-based auth (owner / staff / super admin flows)
- MembersPage, WalkInsPage, WalkInDesk, PaymentsPage, OwnerDashboard, StaffDashboard
- ReportsPage — redesigned charts (grouped bars, colorblind-safe blue+orange, gridlines, Y-axis labels)
- ReportsPage filter — redesigned with clear presets (Today, Last 7 Days, This Week, This Month, Custom), active state badge, date range display
- SettingsPage — PlansManager + Walk-in Prices + Closing Time + Account (Change Password only)
- KioskPage — fully integrated, rate limited, X-Kiosk-Token auth
- Global toast system, login/logout modals via createPortal
- Cloudinary logo upload, UptimeRobot ping
- Action Log system — full audit trail, Manila timezone, role isolation
- Offline-first PWA — SW, IndexedDB queue, syncManager, SyncBadge, optimistic UI
- **Super Admin system** — GymClient model, auth, email invite flow, dashboard, confirm modals
- **Auto walk-out** — cron job at closing time, manual trigger route
- **Live clock** — ticks every second in both layouts, closing time warning

---

## Known Bugs Fixed (this session)
- Walk-in double registration — `StaffDashboard` was calling `offlineWalkInRegister` then `walkInService.register` again → second call blocked by 409 name guard showing false error
- Walk-in backend missing 10-second duplicate guard — added same pattern as Payment model
- `gms:sync-duplicate` not handled for walk-ins — added listener in `WalkInsPage`
- Staff JWT was 7 days — reduced to 12 hours
- Suspended owner could keep using system until token expired — `protect` now does live DB `isActive` check
- Deactivated staff same issue — same fix
- Set/reset password auto-logged in owner — removed `setAuth` call, now redirects to `/login`
- Change Email in owner Settings removed — Super Admin controls owner identity
- `GymClient.lastLoginAt` never updated — added `findOneAndUpdate` in `loginOwner`
- Gym creation left orphaned `User` if `GymClient.create` failed — added rollback
- Email errors silently swallowed in Super Admin controller — all three email calls now surface errors in response
- `gymStore.GymSettings` interface missing `closingTime` — added field + `fetchGymInfo` mapping + `setClosingTime` action
- `setClosingTime` name collision in `SettingsPage` (useState vs gymStore) — aliased store action to `setStoreClosingTime`

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
1. **Offline enhancements** — at-risk renew offline, payments read-only offline
2. **Timezone setting** — add `Settings.timezone` field, replace all `Asia/Manila` hardcodes with it (prerequisite for international sales)
3. **Render Starter upgrade** — $7/mo for static IP before selling
4. **Impersonation tokens** — Super Admin 15-min scoped token to log in as any owner for support

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
SUPER_JWT_SECRET=long-random-string
SUPER_ADMIN_EMAIL=your@email.com
SUPER_ADMIN_PASSWORD=strong-password

# Email (never commit)
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
- `authStore` persist key: `gms-auth`
- `superAdminStore` persist key: `gms-superadmin`
- `gymStore.triggerMemberRefresh()` → sets `lastMemberUpdate: Date.now()` → `MembersPage` refetches
- Expiry extension: if `member.expiresAt > now` → extend from expiry; else extend from today
- Kiosk uses raw `fetch()` with `X-Kiosk-Token` — NOT Axios `api` instance
- `syncManager` is singleton — call `syncManager.init()` once in `App.tsx`
- SW only registers in production build (`npm run build && npm run preview`)
- `logAction()` is fire-and-forget with try/catch — never crashes routes
- Settings cached per-request in `paymentController` — avoids multiple `Settings.findOne()` calls
- `ALLOWED_ORIGINS` in `config/security.ts` must include both Render URLs
- `initAutoCheckoutCron()` must be called AFTER Settings init block in `server.ts` — needs Settings document to exist
- Resend free plan: can only send to your own verified email without a custom domain
- `protect` middleware is now async — adds ~1-5ms DB lookup per request for `isActive` check
- Super Admin route: `/superadmin` — not linked anywhere in public UI
- Owner email is immutable after creation — only Super Admin can manage it
