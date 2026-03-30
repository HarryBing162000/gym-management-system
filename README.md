# Gym Management System — CLAUDE.md

## Project Overview
Full-stack gym management system with role-based access for owners, staff, and members. Designed as a sellable SaaS product targeting Philippine gyms (with international capability planned).

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
- JWT middleware (`protect`) on all protected routes — **async with live DB isActive check**
- `AuthRequest` extends `Request` with `user: { id, role, name }`
- `requireRole(...roles)` for role-based access control
- `protectSuperAdmin` — completely separate middleware using `SUPER_JWT_SECRET`
- **Auto-logout:** `protect` checks `isActive` on every request — suspending a gym or deactivating staff kicks them out on their next request

### Token Functions
- `generateOwnerToken(id, name)` → 7 days
- `generateStaffToken(id, name)` → 12 hours
- `superAdminLogin` token → 12 hours (SUPER_JWT_SECRET)
- Set/reset password tokens → 24h / 1h (JWT_SECRET, `purpose` field)

### ID Schemes
- Members: `GYM-XXXX` (auto-generated, sequential)
- Walk-ins: `WALK-XXX` (daily-resetting, resets each day)
- Gym clients: `GYM-001` format (sequential, `generateGymClientId()`)

### Key Zustand Stores
| Store             | Key             | Responsibility |
|-------------------|-----------------|----------------|
| `authStore`       | `gms-auth`      | Owner/staff session. `logout()` fires POST /api/action-logs/logout BEFORE clearing token |
| `gymStore`        | (not persisted) | Settings + plans + walkInPrices + closingTime. `triggerMemberRefresh()`. `setClosingTime()` |
| `toastStore`      | (not persisted) | Global toast notifications |
| `superAdminStore` | `gms-superadmin`| Super admin JWT. Separate from authStore |

### Settings (Single Source of Truth)
- `Settings.gymName`, `Settings.gymAddress`, `Settings.logoUrl` (Cloudinary)
- `Settings.plans[]` — membership plans (drives PlansManager)
- `Settings.walkInPrices` — walk-in pass pricing
- `Settings.closingTime` — `"HH:mm"` 24h format, Manila time (default `"22:00"`)

---

## Data Models

### User
- Roles: `owner` | `staff`
- Owner: email login. Staff: username login.
- Fields added: `isVerified` (false until set-password), `passwordResetToken`, `passwordResetExpires`

### GymClient
- One per gym enrolled by Super Admin
- `gymClientId`: `GYM-001`, `GYM-002`...
- `status`: `active` | `suspended` | `deleted`
- `billingStatus`: `trial` | `paid` | `overdue` | `cancelled`
- `lastLoginAt`: updated on every owner login in `loginOwner`

### Member
- Hard duplicate blocking: name, email, phone
- `GYM-XXXX` sequential ID
- `balance`, `checkedIn`, `lastCheckIn`

### WalkIn
- `passType`, `amount`, `checkIn`, `checkOut`, `staffId`
- Daily-resetting `WALK-XXX` IDs
- **Duplicate guards:** same-name-today (409) + 10-second rapid-fire (same pattern as Payment)
- **Auto walk-out:** `runAutoCheckout()` called by cron at `Settings.closingTime`

### Payment
- `method`, `type`, `amountPaid`, `balance`, `isPartial`, `processedBy`
- Types: `new_member`, `renewal`, `manual`, `balance_settlement`
- 10-second duplicate guard
- Backend aggregate returns `grandTotal`, `cashTotal`, `onlineTotal`

### ActionLog
- `action` (enum), `performedBy` ({ userId, name, role }), `targetId`, `targetName`, `detail`, `timestamp`
- Indexes: `{ timestamp: -1 }` and `{ 'performedBy.userId': 1, timestamp: -1 }`

---

## Super Admin System

### Routes (all under `/api/superadmin`)
- `POST /login` — public, checks env credentials
- `GET /gyms` — list all gyms
- `POST /gyms` — create gym + owner + send invite email
- `GET /gyms/:id` — get single gym + owner info
- `PATCH /gyms/:id` — update billing/notes
- `PATCH /gyms/:id/suspend` — suspend gym + deactivate owner
- `PATCH /gyms/:id/reactivate` — reactivate gym + owner
- `DELETE /gyms/:id` — soft delete
- `DELETE /gyms/:id/hard-delete` — permanent delete (User + GymClient)
- `POST /gyms/:id/reset-password` — send password reset email to owner
- `POST /gyms/:id/resend-invite` — resend set-password invite

### Email Service (Resend SDK)
- Sender: `onboarding@resend.dev` → change to `noreply@yourdomain.com` after custom domain
- `sendSetPasswordEmail` — 24h token, invite email
- `sendResetPasswordEmail` — 1h token, reset email
- Errors surfaced in API response (`emailSent: false`, `emailError`) — never silently swallowed

### Owner Onboarding
```
Super Admin creates gym → User (isVerified: false) + GymClient + Settings created
→ Resend sends invite → Owner sets password → isVerified: true → redirected to /login
```

### Forgot Password
```
Owner → /forgot-password → email sent → /reset-password?token=... → new password → /login
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
| `offlineService.ts` | `client/src/lib/` | Offline-aware wrappers. `checkWalkInDuplicate()` for IndexedDB |
| `SyncBadge.tsx` | `client/src/components/` | Topbar badge showing pending/failed sync state |
| `sw.ts` | `client/src/` | Service Worker. Workbox precache + NetworkFirst/CacheFirst |

### Offline behavior
- Works offline: check-in/out, walk-in register/checkout, add member, view cached data
- Requires internet: payments, edit member, reports, settings, login
- 409 Conflict on sync = duplicate = treated as success, fires `gms:sync-duplicate` event
- Walk-in `gms:sync-duplicate` → amber info toast in `WalkInsPage`

---

## Auto Walk-out System

- `server/src/utils/autoCheckout.ts` — `initAutoCheckoutCron()` + `runAutoCheckout()`
- Called once in `server.ts` AFTER Settings init block
- Reads `Settings.closingTime` on startup, schedules cron in Asia/Manila timezone
- Manual trigger: `POST /api/walkin/auto-checkout` (owner only)
- Owner configures closing time in **Settings → Walk-in Day Passes**

---

## Live Clock (Topbar)

`useClock(closingTime?)` hook in both `OwnerLayout` and `StaffLayout`:
- Ticks every second, Manila timezone
- Shows `⚠ Closes X:XX PM` amber badge within 30 minutes of closing time
- Reads `closingTime` from `gymStore.settings.closingTime`

---

## Report Charts

Both charts use colorblind-safe colors: **Blue (#2563eb) + Orange (#ea580c)**

### Revenue & Walk-in Trend
- Blue = membership payment revenue (sum of `amountPaid` for all payment types that day)
- Orange = walk-in count (raw count, independent scale)
- Horizontal gridlines + Y-axis labels

### Revenue Source — Last 6 Weeks
- Blue = membership revenue (actual DB payments)
- Orange = walk-in revenue (estimated: count × average pass price, labeled "est.")

### Report Period Filter
- Presets: Today, Last 7 Days, This Week, This Month, Custom
- Active range always shown as orange badge in filter header

---

## Completed Features
- Role-based auth (owner / staff / super admin flows)
- MembersPage, WalkInsPage, WalkInDesk, PaymentsPage, OwnerDashboard, StaffDashboard
- ReportsPage — redesigned charts + filter, PDF export
- SettingsPage — PlansManager + Walk-in Prices + Closing Time + Change Password
- KioskPage — fully integrated, rate limited, X-Kiosk-Token auth
- Global toast system, confirm modals via ConfirmModal component
- Cloudinary logo upload, UptimeRobot ping
- Action Log system — full audit trail, Manila timezone, role isolation
- Offline-first PWA — SW, IndexedDB queue, syncManager, SyncBadge, optimistic UI
- **Super Admin system** — GymClient, auth, email invite, dashboard, all CRUD
- **Auto walk-out** — cron at closing time, manual trigger
- **Live clock** — both layouts, closing time warning
- **Owner password flows** — set-password (invite), forgot-password, reset-password

---

## Known Bugs Fixed (latest session)
- Walk-in double registration — `StaffDashboard` double API call
- Walk-in missing 10-second duplicate guard on backend
- `gms:sync-duplicate` not handled for walk-ins
- Staff JWT was 7 days → reduced to 12 hours
- Suspended owner/deactivated staff not kicked out until token expired → `protect` now checks `isActive`
- Set/reset password auto-logged in owner → now redirects to `/login`
- Change Email in owner Settings removed → Super Admin controls owner identity
- `GymClient.lastLoginAt` never updated → added to `loginOwner`
- Orphaned `User` if `GymClient.create` failed → rollback added
- Resend errors silently swallowed → surfaced in API response
- `gymStore.GymSettings` missing `closingTime` → added field + mapping + `setClosingTime`
- `setClosingTime` name collision in `SettingsPage` → aliased as `setStoreClosingTime`

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
2. **Timezone setting** — `Settings.timezone` field, replace all `Asia/Manila` hardcodes (prerequisite for international)
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
SUPER_JWT_SECRET=long-random-string-32-chars-min
SUPER_ADMIN_EMAIL=your@email.com
SUPER_ADMIN_PASSWORD=strong-password

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
- `protect` is now async — adds ~1-5ms DB lookup per request for `isActive` check
- `authStore` persist key: `gms-auth` | `superAdminStore` persist key: `gms-superadmin`
- `gymStore.triggerMemberRefresh()` → `lastMemberUpdate: Date.now()` → `MembersPage` refetches
- Expiry extension: if `member.expiresAt > now` → extend from expiry; else extend from today
- Kiosk uses raw `fetch()` with `X-Kiosk-Token` — NOT Axios `api` instance
- `syncManager` is singleton — call `syncManager.init()` once in `App.tsx`
- SW only registers in production build (`npm run build && npm run preview`)
- `logAction()` is fire-and-forget with try/catch — never crashes routes
- `initAutoCheckoutCron()` must be called AFTER Settings init block in `server.ts`
- Resend free plan: can only send to your own verified email without a custom domain
- Super Admin route `/superadmin` — not linked anywhere in public UI
- Owner email is immutable after creation — only Super Admin can manage it
- Name collision fix: `const { setClosingTime: setStoreClosingTime } = useGymStore()`
- `ALLOWED_ORIGINS` in `config/security.ts` must include both Render URLs
