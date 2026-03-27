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
| Role   | Login Identifier  | Notes                              |
|--------|-------------------|------------------------------------|
| Owner  | Email             | Full system access                 |
| Staff  | Username          | Limited — sees own actions only    |
| Member | Auto GYM-XXXX ID  | Gym client, separate from User     |

- `User` model → owner + staff authentication
- `Member` model → gym clients (intentionally separate from User)
- JWT middleware (`protect`) on all protected routes
- `AuthRequest` extends `Request` with `user: { id, role, name }`
- `requireRole(...roles)` for role-based access control

### ID Schemes
- Members: `GYM-XXXX` (auto-generated, sequential)
- Walk-ins: `WALK-XXX` (daily-resetting, resets each day)

### Key Zustand Stores
| Store        | Responsibility |
|--------------|----------------|
| `authStore`  | Current user session, role, JWT token. `logout()` fires POST /api/action-logs/logout BEFORE clearing token |
| `gymStore`   | Plans + walk-in price helpers. `lastMemberUpdate` + `triggerMemberRefresh()` for cross-page refresh signal |
| `toastStore` | Global toast notifications |

### Settings (Single Source of Truth)
- `Settings.gymName`, `Settings.address`, `Settings.logoUrl` (Cloudinary)
- `Settings.plans[]` — membership plans (drives PlansManager)
- `Settings.walkInPrices` — walk-in pass pricing

---

## Data Models

### Member
- Hard duplicate blocking on: name, email, phone
- ID format: `GYM-XXXX`
- `balance` field tracks outstanding unpaid amount
- `checkedIn` + `lastCheckIn` for real-time presence tracking

### WalkIn
- Fields: `passType`, `amount`, `checkIn`, `checkOut`, `staffId`
- Pass types: Regular, Student, Couple (different pricing)
- Dual checkout: staff counter + public kiosk
- IDs reset daily: `WALK-XXX`

### Payment
- Fields: `method`, `type`, `amountPaid`, `balance`, `isPartial`, `processedBy`
- Types: `new_member`, `renewal`, `manual`, `balance_settlement`
- Duplicate guard: 10 seconds
- `settleBalance` uses outstanding balance as `totalAmount`, not plan price
- Expiry extension: calculates from `member.expiresAt` (not today) if still active

### ActionLog
- Fields: `action` (enum), `performedBy` ({ userId, name, role }), `targetId`, `targetName`, `detail`, `timestamp`
- Indexes: `{ timestamp: -1 }` and `{ 'performedBy.userId': 1, timestamp: -1 }`
- All filters (role, staffId, action, date) applied server-side

---

## PWA Offline-First System

### Architecture (5 layers)
```
React UI → offlineQueue (IndexedDB) → syncManager → Service Worker → Render backend
```

### New files added
| File | Location | Purpose |
|------|----------|---------|
| `offlineQueue.ts` | `client/src/lib/` | IndexedDB wrapper. Stores pending actions with status: pending/syncing/failed |
| `syncManager.ts` | `client/src/lib/` | Watches navigator.onLine. Drains queue on reconnect. Retry 3x. Fires custom events |
| `offlineService.ts` | `client/src/lib/` | Offline-aware wrappers for check-in, checkout, walk-in register/checkout, add member |
| `SyncBadge.tsx` | `client/src/components/` | Topbar badge showing pending/failed sync state. Orange = pending, Red = failed, Amber = offline |
| `sw.ts` | `client/src/` | Service Worker. Workbox precache + NetworkFirst for members/walkins, CacheFirst for gym-info |

### What works offline
- Member check-in / check-out → queued in IndexedDB
- Walk-in register / checkout → queued in IndexedDB
- Add new member → queued in IndexedDB
- View members list → cached (1 hour)
- View today's walk-ins → cached (30 min)
- Gym info (name, logo, plans) → cached (24 hours)
- App shell loads without internet

### What requires internet
- Log payment
- Edit member
- Reports
- Settings changes
- Login (first time)

### Key technical decisions
- `sw.ts` uses `(self as any).__WB_MANIFEST` — Workbox scans compiled JS for this literal string
- Route matchers use `url.href.includes()` not `url.pathname` — API is cross-origin (Render backend)
- `TypedSW` interface avoids `lib.webworker.d.ts` conflict with DOM lib in tsconfig
- 409 Conflict on sync = duplicate = treated as success, fires `gms:sync-duplicate` event (not error)
- `syncManager` fires custom events: `gms:sync-complete`, `gms:sync-failed`, `gms:sync-duplicate`
- `SyncBadge` shows "Offline" amber badge even with empty queue via native `navigator.onLine` listener
- `vite.config.ts` uses `injectManifest` block only (not `workbox` block) when `strategies: "injectManifest"`

### Offline UI feedback
- `OwnerLayout` + `StaffLayout`: Live badge → Offline badge (amber pulsing) when internet drops
- Sticky amber banner below header: "You're offline — check-ins and walk-ins are queued..."
- `SyncBadge` in topbar: orange count badge / amber "Offline" / red failed
- Optimistic UI: check-in/checkout button flips immediately without waiting for network
- Submit button shows "Queue Member (Offline)" when offline

### npm packages required
```bash
cd client
npm install -D vite-plugin-pwa workbox-precaching workbox-routing workbox-strategies workbox-expiration workbox-cacheable-response
```

---

## Completed Features
- Role-based auth (owner / staff / member flows)
- MembersPage — `lastMemberUpdate` watcher for auto-refresh after payment renewal
- WalkInsPage (owner: Today + History tabs, summary cards, live pulse, auto-refresh)
- WalkInDesk (staff: register + checkout tab, professional SVG pass type icons)
- PaymentsPage
  - `forceStaffView` for staff → today-only
  - Inline search results (no absolute positioning)
  - Payment type selector: New Member / Renewal / Manual
  - Settle Balance shortcut when member has outstanding balance
  - Member search filters `status: "active"` only
  - `triggerMemberRefresh()` called after renewal so MembersPage updates
  - Expiry preview uses `member.expiresAt` as base date (not today)
- OwnerDashboard
  - Stats, at-risk members, RenewModal, `useSearchParams`
  - Recent Activity widget (last 5 action logs)
  - `calcNewExpiry()` in RenewModal extends from `member.expiresAt` not today
  - Member card bottom border accent `border-b-2 border-b-[#FF6B1A]/40`
  - Members Inside Now grid — `flex-1` removed, natural card height
- StaffDashboard (stats bar, at-risk + renew, keyboard check-in, walk-in auto-reset, payments)
- ReportsPage (PDF export, race condition fixed, 1000 record limit with truncation warning)
- SettingsPage (PlansManager + Walk-in Prices + Account)
- KioskPage — fully integrated
  - Public self check-in by name or GYM-ID
  - Walk-in self checkout by WALK-XXX
  - Auto-suggest dropdown with members + today's walk-ins
  - Auto-reset to idle after 8 seconds
  - Offline banner + terminal status indicator
  - Clock with seconds display
  - Rate limited (20 req/min) + `X-Kiosk-Token` header auth
  - Gym name comes from `gymStore.settings.gymName` — no hardcoding
- Global toast system (`toastStore`, `ToastContainer` via `createPortal` in `App.tsx`)
- Login success + logout confirm modals (via `createPortal` in `OwnerLayout` + `StaffLayout`)
- Cloudinary logo upload
- UptimeRobot ping every 5 min (keep Render awake)
- Dynamic plans — Settings is single source of truth
- Action Log system (fully complete)
  - `ActionLog` model + `logAction()` helper (try/catch — never crashes routes)
  - Injected into: login, logout, check-in, checkout, walk-in register/checkout, payment create/settle, member CRUD, settings changes
  - `GET /api/action-logs` — server-side filtering by action, role, staffId, date range, pagination
  - `POST /api/action-logs/logout` — called by `authStore.logout()` before token is cleared
  - `ActionLogPage.tsx` — owner only, table with 5 filters
  - `MyActivityPage.tsx` — staff only, timeline feed grouped by day, summary stats, date presets defaulting to Today
  - Recent Activity widget on OwnerDashboard (last 5 actions)
  - Staff name stripped from detail in MyActivityPage
  - Manila timezone-aware date filtering (`toManilaStart` / `toManilaEnd`)
- **Offline-first PWA (complete)**
  - Service Worker with Workbox precaching
  - IndexedDB offline queue with retry logic
  - Background sync manager with custom events
  - SyncBadge topbar indicator
  - Offline banner + Live/Offline status badge
  - Optimistic UI for check-in/checkout
  - Offline add member with duplicate detection
  - 409 Conflict handled as duplicate (not failure)

---

## Known Bugs Fixed
- `User.findOne({ email: undefined })` false-match bug
- GYM-ID search regex fixed from exact-match to starts-with pattern
- Babel breaks on `.reduce<T>()` generics — avoid inline generic reduce
- ReportsPage race condition: `fetchRevenue` + `fetchWalkIns` merged into `Promise.all`
- `settleBalance` was using plan price as `totalAmount` — now uses actual outstanding balance
- Walk-in icons replaced: emoji → professional SVG
- Payment modal search results were absolutely positioned — now inline flow
- Action log date filters were UTC-based — fixed to Manila timezone
- `paymentController.createPayment` expiry calculated from today — fixed to use `member.expiresAt`
- `getNewExpiry()` in `PaymentsPage` modal mirrors backend expiry logic
- `calcNewExpiry()` in `OwnerDashboard` RenewModal fixed — extends from `member.expiresAt`
- `MembersPage` now watches `lastMemberUpdate` from `gymStore` and refetches on change
- `PaymentsPage` member search showed inactive members — fixed with `status: "active"` filter
- `paymentService.settleBalance` → correct method name is `settle`
- Kiosk hardcoded `"at IronCore"` in checkout message removed
- `VITE_API_URL` pointed to `localhost:5000` in production — fixed to Render backend URL
- Action log returning 404 in production — caused by stale Render deploy
- SW route matchers used `url.pathname` — fixed to `url.href.includes()` for cross-origin API caching
- `SyncBadge` not showing offline state — fixed with native `navigator.onLine` listener
- 409 Conflict on member sync was marking as failed — now treated as duplicate success
- `self.__WB_MANIFEST` renamed by TypeScript compiler — fixed with `(self as any).__WB_MANIFEST`
- `workbox` block + `injectManifest` block conflict in vite.config — removed workbox block
- Mixed static/dynamic import of `toastStore` in SyncBadge — converted to static import

---

## Pending / Next Up
1. **Super Admin Dashboard** — multi-tenancy for selling to multiple gyms
   - `GymClient` model, `SuperAdmin` model + separate auth
   - Impersonation with 15-min tokens logged to `SuperAuditLog`
2. **Offline enhancements**
   - At-risk members cache + renew offline
   - Payments/reports read-only offline
   - Walk-in duplicate name warning
3. **Render upgrade** → Starter plan ($7/mo) for static IP before selling

---

## Git Rules (IMPORTANT)
- **Never commit** `dist/`, `.env`, `*.env.*`, `*.http` files
- Secrets go in Render environment variables ONLY — never in code or committed files
- Server `dist/` is built by Render on deploy — never pre-built and committed
- `.gitignore` entries: `dist`, `dist-ssr`, `.env`, `.env.*`, `!.env.example`, `**/*.http`

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
- Express 5 incompatibility: no express-mongo-sanitize — manual sanitizer in place
- Member ≠ User — never conflate these two models
- `AuthRequest` has `user: { id, role, name }` — name included for action logging, no extra DB calls
- `logAction()` is fire-and-forget with try/catch — never let logging crash a real operation
- `autoLogPayment()` has its own try/catch — logs errors instead of swallowing silently
- Settings cached per-request in `paymentController` — avoids multiple `Settings.findOne()` calls
- Duplicate payment guard: 10 seconds
- ReportsPage fetch limit: 1000 records with amber warning banner if truncated
- `authStore` persist key: `gms-auth`
- `gymStore.triggerMemberRefresh()` sets `lastMemberUpdate: Date.now()` → `MembersPage` `useEffect` watches and refetches
- Expiry extension (frontend + backend): if `member.expiresAt > now` → extend from expiry date; else extend from today
- Kiosk routes: `GET /api/kiosk/search`, `POST /api/kiosk/member/checkin`, `POST /api/kiosk/member/checkout`, `GET /api/kiosk/walkin/:walkId`, `POST /api/kiosk/walkin/checkout`
- `ALLOWED_ORIGINS` in `config/security.ts` must include both frontend and backend Render URLs
- Use `.env.local` for local dev so `VITE_API_URL=localhost:5000` never gets committed to GitHub
- Renaming a Render service changes the display name only — the original URL is permanent
- PWA Service Worker only registers in production build (`npm run build && npm run preview`) — not in `npm run dev`
- SW uses `(self as any).__WB_MANIFEST` — TypeScript would rename `sw.__WB_MANIFEST` during compilation
- `syncManager` is a singleton module — call `syncManager.init()` once in `App.tsx`
- Offline queue entries include JWT token captured at queue time — token may expire before sync.
