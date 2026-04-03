# Gym Management System

Full-stack gym management SaaS. Role-based access for owners, staff, and members. Built for Philippine gyms with international timezone support.

**GitHub:** HarryBing162000/gym-management-system
**Frontend:** https://ironcore-gms.onrender.com
**Backend:** https://ironcore-gms-server.onrender.com

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite + Tailwind v4 + Zustand + PWA |
| Backend | Node.js + Express 5 + TypeScript + MongoDB Atlas |
| Auth | JWT (role-based) + bcrypt 12 + Zod validation |
| Offline | Workbox + IndexedDB queue + syncManager |
| Email | Resend SDK |
| Media | Cloudinary (logo upload) |
| Deploy | Render (frontend + backend) |

---

## Roles

| Role | Login | Token | Notes |
|------|-------|-------|-------|
| Owner | Email | 7d | Full access |
| Staff | Username | 12h | Restricted scope |
| Super Admin | Email (env) | 12h | Separate secret |
| Member | GYM-XXXX | — | Kiosk only |

---

## Key Features

### Core
- Member management (GYM-XXXX IDs, plans, expiry, balance tracking)
- Walk-in day passes (Regular/Student/Couple, WALK-XXX daily IDs)
- Payments (cash/online, partial payments, balance settlement)
- Reports with PDF export (colorblind-safe charts)
- Action Log (full audit trail, role isolation)

### Auth & Security
- Async `protect` middleware — live `isActive` + `GymClient.status` check on every request
- Staff `ownerId` field — links staff to owner's gym for suspension enforcement
- Login rate limiting — 5 attempts → 15-min lockout per account
- Forced logout message via `sessionStorage("gms:logout-reason")`
- Gym suspension kicks owner + all staff immediately

### Offline-First PWA
- Works offline: check-in/out, walk-in register/checkout, add member, at-risk renewal
- Per-page localStorage cache with amber offline banner
- Auto-refresh on reconnect
- IndexedDB queue drains on reconnect (retry 3×, 409 = success)
- SyncBadge topbar indicator

### Super Admin
- Multi-tenant gym management from `/superadmin`
- Owner invite flow via Resend email
- Full CRUD: create/suspend/reactivate/delete gyms
- Owner password reset

### Settings
- Dynamic plans (PlansManager)
- Walk-in pricing
- Gym closing time
- **Timezone** (IANA string — replaces all `Asia/Manila` hardcodes)
- Logo via Cloudinary

---

## Offline Cache Keys (localStorage)

| Key | Page |
|-----|------|
| `gms:dashboard-cache` | Owner Dashboard |
| `gms:staff-dashboard-cache` | Staff Dashboard |
| `gms:payments-cache` | Payments |
| `gms:payments-summary-cache` | Payments |
| `gms:walkins-today-cache` | Walk-ins Today |
| `gms:walkins-history-cache` | Walk-ins History |

---

## Timezone System

`Settings.timezone` (IANA string, default `"Asia/Manila"`) is used everywhere:
- Backend: `autoCheckout.ts`, `walkInController.ts`, `authController.ts`
- Frontend: `gymStore.getTimezone()`, `WalkInsPage`, `PaymentsPage`, `useClock.ts`
- Owner configures via Settings → Walk-in Day Passes → Timezone dropdown

---

## Auto Walk-out

Cron job at `Settings.closingTime` in `Settings.timezone`. Finds all open walk-ins for today → marks checked out. Manual trigger: `POST /api/walkin/auto-checkout`.

---

## Completed

- All dashboard pages (owner + staff) with offline cache
- Walk-in action column on Today + History tabs
- Walk-in history checkout (date passed through full stack)
- Offline renew for at-risk members
- Timezone setting (fully replaces Asia/Manila hardcodes)
- Login rate limiting
- Gym suspension enforcement
- Super Admin system with email invite
- Live clock hook (`useClock.ts`) reads from gymStore

---

## Pending

1. Render Starter upgrade — $7/mo static IP before selling
2. Super Admin impersonation tokens — 15-min scoped login as any owner

---

## Git Rules

- Never commit: `dist/`, `.env`, `*.env.*`, `*.http`, `node_modules/`
- Secrets in Render env vars only
- Build command: `npm install --include=dev && npm run build`

---

## Dev Notes

- Tailwind v4: `style={{}}` for spacing only
- `gymStore.getTimezone()` — use everywhere instead of hardcoding `"Asia/Manila"`
- `useClock.ts` at `client/src/hooks/useClock.ts`
- `protect` adds ~2-10ms per request (isActive + suspension check)
- `logAction()` is fire-and-forget — never crashes routes
- `initAutoCheckoutCron()` must be called AFTER Settings init in `server.ts`
- `gms:logout-reason` in sessionStorage carries forced logout messages to LoginPage
- Offline cache is null until pages are visited online — hard refresh if needed
