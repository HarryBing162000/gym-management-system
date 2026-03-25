# Gym Management System

A full-stack gym management application with role-based access for owners, staff, and members.

---

## Tech Stack

| Side     | Technology                                              |
|----------|---------------------------------------------------------|
| Frontend | React, TypeScript, Vite, Tailwind CSS v4, Zustand, TanStack Query |
| Backend  | Node.js, Express 5, TypeScript, MongoDB Atlas, JWT, bcrypt, Zod |
| Hosting  | Render (frontend + backend)                             |
| Images   | Cloudinary (gym logo)                                   |
| Uptime   | UptimeRobot (5-min pings on free tier)                  |

---

## Roles

| Role   | Login         | Access                                                    |
|--------|---------------|-----------------------------------------------------------|
| Owner  | Email         | Full access — dashboard, members, payments, walk-ins, reports, settings, action log |
| Staff  | Username      | Operational — check-in desk, walk-in desk, members, payments (today only), my activity |
| Member | GYM-XXXX ID   | Kiosk only — self check-in and walk-in self checkout      |

---

## Features

### Owner
- Dashboard with live stats, at-risk members, revenue breakdown, recent activity feed
- Members — add, edit, check in/out, deactivate, reactivate, renew
- Payments — full/partial payments, balance settlement, PDF export, date filters
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

### Public Kiosk
- Member self check-in by name or GYM-ID
- Walk-in self checkout by WALK-XXX ID

---

## Project Structure

```
project/
├── client/                  # React frontend
│   └── src/
│       ├── pages/           # Full screens (one file = one page)
│       ├── layouts/         # OwnerLayout, StaffLayout (sidebar + topbar)
│       ├── components/      # ToastContainer, PlansManager
│       ├── services/        # API calls (api.ts, memberService, paymentService, etc.)
│       ├── store/           # Zustand: authStore, gymStore, toastStore
│       └── types/           # TypeScript interfaces
│
├── server/                  # Node.js backend
│   └── src/
│       ├── config/          # db.ts, env.ts, security.ts
│       ├── models/          # Member, User, Payment, WalkIn, Settings, ActionLog
│       ├── routes/          # URL → controller mapping
│       ├── controllers/     # Business logic
│       ├── middleware/       # authMiddleware, validate, sanitize, errorHandler
│       └── utils/           # logAction.ts helper
│
└── shared/                  # Shared TypeScript types (client + server)
```

---

## Key Architecture Decisions

**Separate Member and User models** — `User` handles owner/staff auth. `Member` handles gym clients. Members don't need passwords.

**Manual NoSQL sanitizer** — `express-mongo-sanitize` is incompatible with Express 5. Custom middleware strips `$` and `.` from request bodies.

**Daily-resetting walk-in IDs** — `WALK-001` format resets every day. Short and human-friendly for the kiosk.

**Dynamic plans** — `Settings.plans[]` is the single source of truth. `gymStore` provides helpers across all pages.

**Action Log system** — every staff/owner action is logged with `logAction()`. Server enforces role isolation — staff can only ever read their own logs.

**Staff accountability** — every payment and walk-in records `processedBy` / `staffId`.

**JWT payload includes name** — `{ id, role, name }` so action logs don't need extra DB calls.

**forceStaffView** — same `PaymentsPage` component, different data scope for staff vs owner.

---

## Environment Variables

```env
# server/.env
PORT=5000
MONGO_URI=your_mongodb_atlas_uri
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
NODE_ENV=production

# client/.env
VITE_API_URL=https://your-backend.onrender.com
```

---

## Running Locally

```bash
# Backend
cd server
npm install
npm run dev

# Frontend
cd client
npm install
npm run dev
```

---

## Deployment Checklist

- [ ] `VITE_API_URL` set to production backend URL
- [ ] `MONGO_URI` pointing to MongoDB Atlas (not localhost)
- [ ] `JWT_SECRET` set to a strong random string
- [ ] Cloudinary credentials configured
- [ ] UptimeRobot ping configured (keep Render awake on free tier)
- [ ] CORS origin whitelist includes frontend domain
- [ ] `NODE_ENV=production` on backend
- [ ] Consider Render Starter ($7/mo) for static IP before selling

---

## Color Scheme

| Name         | Hex       |
|--------------|-----------|
| Cyber Orange | `#FF6B1A` |
| Gold         | `#FFB800` |
| Charcoal     | `#1a1a1a` |

---

## Pending

- KioskPage full integration (drafted, paused pending audit)
- Render upgrade to Starter plan for static IP

---

*Last updated: March 2026*
