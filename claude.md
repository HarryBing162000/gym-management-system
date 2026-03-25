# Gym Management System — CLAUDE.md

## Project Overview
Full-stack gym management system with role-based access for owners, staff, and members.

**GitHub:** HarryBing162000/gym-management-system
**Deployed:** Render (frontend + backend)
**Generalized name:** Gym Management System (do NOT use "IronCore" anywhere)

---

## Tech Stack

### Frontend
- React + TypeScript + Vite
- Tailwind CSS v4 — use `style={{}}` inline for spacing, NOT utility classes like `p-4`
- Zustand (global state)
- TanStack Query (server state / API calls)

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
- JWT middleware (`protect`) on all protected routes — `AuthRequest` extends `Request` with `user: { id, role, name }`
- `requireRole(...roles)` for role-based access control

### ID Schemes
- Members: `GYM-XXXX` (auto-generated, sequential)
- Walk-ins: `WALK-XXX` (daily-resetting, resets each day)

### Key Zustand Stores
| Store       | Responsibility                              |
|-------------|---------------------------------------------|
| `authStore` | Current user session, role, JWT token. `logout()` fires POST /api/action-logs/logout BEFORE clearing token |
| `gymStore`  | Plans + walk-in price helpers               |
| `toastStore`| Global toast notifications                  |

### Settings (Single Source of Truth)
- `Settings.gymName`, `Settings.address`, `Settings.logoUrl` (Cloudinary)
- `Settings.plans[]` — membership plans (drives PlansManager)
- `Settings.walkInPrices` — walk-in pass pricing

---

## Data Models

### Member
- Hard duplicate blocking on: name, email, phone
- ID format: `GYM-XXXX`

### WalkIn
- Fields: `passType`, `amount`, `checkIn`, `checkOut`, `staffId`
- Pass types: Regular, Student, Couple (different pricing)
- Dual checkout: staff counter + public kiosk
- IDs reset daily: `WALK-XXX`

### Payment
- Fields: `method`, `type`, `amountPaid`, `balance`, `isPartial`, `processedBy`
- Duplicate guard: 10 seconds (raised from 3s)
- `settleBalance` uses outstanding balance as `totalAmount`, not plan price

### ActionLog
- Fields: `action` (enum), `performedBy` ({ userId, name, role }), `targetId`, `targetName`, `detail`, `timestamp`
- Indexes: `{ timestamp: -1 }` and `{ 'performedBy.userId': 1, timestamp: -1 }`
- All filters (role, staffId, action, date) applied server-side — no client-side filtering

---

## Completed Features
- Role-based auth (owner / staff / member flows)
- MembersPage
- WalkInsPage (owner: Today + History tabs, summary cards, live pulse, auto-refresh)
- WalkInDesk (staff: register + checkout tab, professional SVG pass type icons)
- PaymentsPage (`forceStaffView` for staff → today-only; inline search results in modal)
- OwnerDashboard (stats, at-risk members, RenewModal, `useSearchParams`, Recent Activity widget)
- StaffDashboard (stats bar, at-risk + renew, keyboard check-in, walk-in auto-reset, payments)
- ReportsPage (PDF export, race condition fixed, 1000 record limit with truncation warning)
- SettingsPage (PlansManager + Walk-in Prices + Account)
- KioskPage (public self check-in by name or GYM-ID; walk-in self checkout by WALK-XXX)
- Global toast system (`toastStore`, `ToastContainer` via `createPortal` in `App.tsx`)
- Login success + logout confirm modals (via `createPortal` in `OwnerLayout` + `StaffLayout`)
- Cloudinary logo upload
- UptimeRobot ping every 5 min (keep Render awake)
- Dynamic plans — Settings is single source of truth
- **Action Log system (fully complete)**
  - `ActionLog` model + `logAction()` helper (try/catch — never crashes routes)
  - Injected into: login, logout, check-in, checkout, walk-in register/checkout, payment create/settle, member CRUD, all settings changes
  - `GET /api/action-logs` — server-side filtering by action, role, staffId, date range, pagination
  - `POST /api/action-logs/logout` — called by `authStore.logout()` before token is cleared
  - `ActionLogPage.tsx` — owner only, table with 5 filters (action, role, staff member, date from/to)
  - `MyActivityPage.tsx` — staff only, timeline feed grouped by day, summary stats, date presets
  - Recent Activity widget on OwnerDashboard (last 5 actions)
  - Staff name stripped from detail in MyActivityPage (personal log — no redundant "You did X")
  - Manila timezone-aware date filtering (`toManilaStart` / `toManilaEnd`)

---

## Known Bugs Fixed
- `User.findOne({ email: undefined })` false-match bug
- GYM-ID search regex fixed from exact-match to starts-with pattern
- Babel breaks on `.reduce<T>()` generics — avoid inline generic reduce
- ReportsPage race condition: `fetchRevenue` + `fetchWalkIns` now run together via `Promise.all`, staffStats built from both datasets atomically
- `settleBalance` was using plan price as `totalAmount` — now uses actual outstanding balance
- Walk-in icons replaced: emoji → professional SVG (person, graduation cap, two people)
- Payment modal search results were absolutely positioned and clipping — now inline flow
- Action log date filters were UTC-based and missing Manila-timezone logs

---

## Pending / Next Up
1. **KioskPage full integration** (drafted, integration paused)
2. **Render upgrade** → Starter plan ($7/mo) for static IP before selling/going live

---

## Dev Notes
- Tailwind v4: spacing via `style={{}}` only — no `p-4`, `mt-2`, etc.
- Babel issue: avoid `.reduce<T>()` generic syntax in TSX files
- Express 5 incompatibility: no express-mongo-sanitize — manual sanitizer in place
- Member ≠ User — never conflate these two models
- `authMiddleware.ts` — `AuthRequest` has `user: { id, role, name }` (name added for action logging)
- `logAction()` is fire-and-forget with try/catch — never let logging crash a real operation
- `autoLogPayment()` now has its own try/catch and logs errors instead of swallowing silently
- Settings cached per-request in `paymentController` to avoid multiple `Settings.findOne()` calls
- Duplicate payment guard raised to 10 seconds (was 3s)
- ReportsPage fetch limit: 1000 records with amber warning banner if truncated
- `authStore` persist key: `gms-auth` (renamed from `ironcore-auth`)
