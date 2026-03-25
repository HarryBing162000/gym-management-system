# Gym Management System

A full-stack gym management application with role-based access for owners, staff, and members.

---

## Tech Stack

| Side     | Technology |
|----------|-----------|
| Frontend | React, TypeScript, Vite, Tailwind CSS v4, Zustand, TanStack Query |
| Backend  | Node.js, Express 5, TypeScript, MongoDB Atlas, JWT, bcrypt 12, Zod |
| Hosting  | Render (frontend + backend) |
| Images   | Cloudinary (gym logo) |
| Uptime   | UptimeRobot (5-min pings on free tier) |

---

## Roles

| Role   | Login         | Access |
|--------|---------------|--------|
| Owner  | Email         | Full access — dashboard, members, payments, walk-ins, reports, settings, action log |
| Staff  | Username      | Operational — check-in desk, walk-in desk, members, payments (today only), my activity |
| Member | GYM-XXXX ID   | Kiosk only — self check-in and walk-in self checkout |

---

## Features

### Owner
- Dashboard with live stats, at-risk members, revenue breakdown, recent activity feed
- Members — add, edit, check in/out, deactivate, reactivate, renew
- Payments — full/partial payments, balance settlement, type selector, date filters
- Walk-ins — today view + history, summary cards, live pulse
- Reports — revenue charts, member growth, staff performance, PDF export
- Settings — manage plans, walk-in prices, gym info, logo (Cloudinary)
- Action Log — full audit trail with filters by action, role, staff member, date range

### Staff
- Check-in desk — keyboard shortcut check-in, at-risk members, today's log
- Walk-in desk — register (Regular/Student/Couple passes), checkout tab
- Members — read + renew (no deactivate/reactivate)
- Payments — today's payments only (`forceStaffView`)
- My Activity — personal timeline feed with date presets and summary stats

### Public Kiosk (`/kiosk` — no login required)
- Member self check-in by name or GYM-ID
- Walk-in self checkout by WALK-XXX ID
- Auto-suggest dropdown as you type
- Auto-resets to idle after 8 seconds
- Offline detection banner
- Protected by `X-Kiosk-Token` header + rate limiting (20 req/min)

---

## Project Structure

```
project/
├── client/                   # React frontend
│   └── src/
│       ├── pages/            # Full screens — one file = one page
│       ├── layouts/          # OwnerLayout, StaffLayout (sidebar + topbar)
│       ├── components/       # ToastContainer, PlansManager
│       ├── services/         # API calls (api.ts + per-resource services)
│       ├── store/            # Zustand: authStore, gymStore, toastStore
│       └── types/            # TypeScript interfaces
│
├── server/                   # Node.js backend
│   └── src/
│       ├── config/           # db.ts, env.ts, security.ts
│       ├── models/           # Member, User, Payment, WalkIn, Settings, ActionLog
│       ├── routes/           # URL → controller mapping
│       ├── controllers/      # Business logic
│       ├── middleware/       # authMiddleware, validate, sanitize, errorHandler, security
│       └── utils/            # logAction.ts helper
│
└── shared/                   # Shared TypeScript types (client + server)
```

---

## Key Architecture Decisions

**Separate Member and User models** — `User` handles owner/staff auth. `Member` handles gym clients. Members don't need passwords or login.

**Manual NoSQL sanitizer** — `express-mongo-sanitize` is incompatible with Express 5. Custom middleware strips `$` and `.` from request bodies.

**Daily-resetting walk-in IDs** — `WALK-001` format resets every day. Short and human-friendly for the kiosk.

**Dynamic plans** — `Settings.plans[]` is the single source of truth. `gymStore` provides helpers (`getPlanPrice`, `getPlanDuration`, `getActivePlans`) across all pages.

**Action Log system** — every staff/owner action is logged with `logAction()`. Server enforces role isolation — staff can only ever read their own logs. `logAction()` is always fire-and-forget with try/catch.

**JWT payload includes name** — `{ id, role, name }` so action logs never need extra DB calls to find the performer's name.

**Cross-page refresh signal** — `gymStore.triggerMemberRefresh()` sets `lastMemberUpdate: Date.now()`. `MembersPage` watches this with a `useEffect` and refetches, so expiry updates from `PaymentsPage` show immediately.

**Expiry extension logic** — both frontend preview and backend save: if `member.expiresAt > now`, extend from the expiry date; if already expired, extend from today. Members never lose remaining days.

**Kiosk machine auth** — `/api/kiosk/*` routes use `X-Kiosk-Token` header (not JWT). `kioskAuth.ts` validates with timing-safe comparison. `KIOSK_SECRET` must be 32+ chars. Same secret on server (`KIOSK_SECRET`) and client (`VITE_KIOSK_SECRET`).

**forceStaffView** — same `PaymentsPage` component, different data scope for staff vs owner. No duplicate code.

**UptimeRobot 5-minute pings** — Render free tier spins down after inactivity. Recommend Render Starter ($7/mo) for production with static IP.

---

## Environment Variables

```env
# server/.env
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

## Running Locally

```bash
# Backend
cd server
npm install
npm run dev

# Frontend (separate terminal)
cd client
npm install
npm run dev
```

---

## Deployment Checklist

- [x] `VITE_API_URL` set to production backend URL on Render
- [x] `MONGO_URI` pointing to MongoDB Atlas
- [x] `JWT_SECRET` set to a strong random string
- [x] `KIOSK_SECRET` set on backend + `VITE_KIOSK_SECRET` set on frontend (same value)
- [x] Cloudinary credentials configured
- [x] UptimeRobot ping configured (keep Render awake on free tier)
- [x] CORS `ALLOWED_ORIGINS` includes frontend domain
- [x] `NODE_ENV=production` on backend
- [x] Use `.env.local` locally so `localhost:5000` never gets committed
- [ ] Render Starter upgrade ($7/mo) for static IP before selling

---

## Color Scheme

| Name         | Hex       |
|--------------|-----------|
| Cyber Orange | `#FF6B1A` |
| Gold         | `#FFB800` |
| Charcoal     | `#1a1a1a` |

---

## Pending

1. Offline-first PWA — Service Worker + IndexedDB + background sync (all actions including payments)
2. Super Admin Dashboard — multi-tenancy for selling to multiple gym clients
3. Render Starter upgrade for static IP

---

*Last updated: March 2026*
