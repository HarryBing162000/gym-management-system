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
- Backend aggregate returns `grandTotal`, `cashTotal`, `onlineTotal` — no limit

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

---

## Completed Features
- Role-based auth (owner / staff / member flows)
- MembersPage, WalkInsPage, WalkInDesk, PaymentsPage, OwnerDashboard, StaffDashboard
- ReportsPage — uses `grandTotal`/`cashTotal`/`onlineTotal` from backend aggregate (accurate regardless of limit)
- SettingsPage (PlansManager + Walk-in Prices + Account)
- KioskPage — fully integrated, rate limited, X-Kiosk-Token auth
- Global toast system, login/logout modals via createPortal
- Cloudinary logo upload, UptimeRobot ping
- Action Log system — full audit trail, Manila timezone, role isolation
- Offline-first PWA — SW, IndexedDB queue, syncManager, SyncBadge, optimistic UI

---

## Known Bugs Fixed
- `User.findOne({ email: undefined })` false-match bug
- GYM-ID search regex fixed from exact-match to starts-with
- Babel breaks on `.reduce<T>()` generics — avoid inline generic reduce
- ReportsPage payment limit was capped at 100 on backend — raised to 1000
- ReportsPage now uses backend aggregate totals instead of summing fetched records
- `estimateWalkInRevenue()` uses dynamic prices from gymStore not hardcoded values
- SW route matchers use `url.href.includes()` not `url.pathname` for cross-origin API
- 409 Conflict on member sync treated as duplicate success not failure
- `(self as any).__WB_MANIFEST` prevents TypeScript renaming during SW compilation
- Action log date filters fixed to Manila timezone
- Expiry extension always from `member.expiresAt` not today

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
1. **Super Admin Dashboard** — GymClient model, SuperAdmin auth, impersonation with 15-min tokens, SuperAuditLog
2. **Offline enhancements** — at-risk renew offline, payments read-only offline, walk-in duplicate warning
3. **Render Starter upgrade** — $7/mo for static IP before selling

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
- Express 5: no express-mongo-sanitize — manual sanitizer in place
- Member ≠ User — never conflate these two models
- `authStore` persist key: `gms-auth`
- `gymStore.triggerMemberRefresh()` → sets `lastMemberUpdate: Date.now()` → `MembersPage` refetches
- Expiry extension: if `member.expiresAt > now` → extend from expiry; else extend from today
- Kiosk uses raw `fetch()` with `X-Kiosk-Token` — NOT Axios `api` instance
- `syncManager` is singleton — call `syncManager.init()` once in `App.tsx`
- SW only registers in production build (`npm run build && npm run preview`)
- `logAction()` is fire-and-forget with try/catch — never crashes routes
- Settings cached per-request in `paymentController` — avoids multiple `Settings.findOne()` calls
- `ALLOWED_ORIGINS` in `config/security.ts` must include both Render URLs
- ReportsPage `paymentController.getPayments` limit cap: `Math.min(1000, ...)`

---

## Known Issues / Needs Fix Before Next Phase

### Walk-in Duplicate Bug (UNRESOLVED)
- **Problem:** Registering a walk-in (either online or offline) returns duplicate entries
- **Symptoms:** Same walk-in appears twice in the list — once from optimistic UI and once from the server response, OR offline queue syncs and creates a duplicate on the backend
- **Location:** `WalkInPage.tsx` (staff register tab and owner) + `offlineService.ts` (offline walk-in register wrapper) + `walkInController.ts` (backend register endpoint)
- **Fix needed:** 
  1. Add duplicate detection on the backend similar to payment 10-second duplicate guard
  2. Add `gms:sync-duplicate` handling for walk-ins in `syncManager.ts` — same pattern as member offline duplicate (409 → friendly warning toast "Walk-in already registered")
  3. Review optimistic UI in `StaffDashboard.tsx` — may be adding to list before server confirms, then adding again on response
- **Priority:** Fix this BEFORE proceeding with Super Admin Dashboard
