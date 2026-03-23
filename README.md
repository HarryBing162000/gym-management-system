# ⚡ IronCore GMS — Gym Management System

A full-stack gym management system with role-based access, member management, walk-in tracking, payments, business reports, dynamic pricing, owner settings, logo branding, and a public self-service kiosk.

**Live URLs**
- Frontend: https://ironcore-gms.onrender.com
- Backend API: https://ironcore-gms-server.onrender.com

---

## Table of Contents

1. [System Overview](#system-overview)
2. [How It Works](#how-it-works)
3. [User Roles](#user-roles)
4. [How to Use](#how-to-use)
   - [Owner](#owner)
   - [Staff](#staff)
   - [Kiosk (Public)](#kiosk-public)
5. [Tech Stack](#tech-stack)
6. [Local Development Setup](#local-development-setup)
7. [Environment Variables](#environment-variables)
8. [API Endpoints](#api-endpoints)
9. [Security](#security)
10. [Deployment](#deployment)
11. [Changelog](#changelog)

---

## System Overview

IronCore GMS is a web-based gym management system designed to handle day-to-day operations including:

- Member registration, check-in/check-out, and lifecycle management
- Walk-in pass management with dynamic pricing (Regular, Student, Couple)
- Dynamic membership plans — owner can add, edit, deactivate, or delete plans from Settings
- Dynamic walk-in pricing — owner can update pass prices from Settings
- Staff management and accountability tracking
- Payment recording with cash/online split, partial payments, and balance settlement
- Business reports — revenue, member loyalty, walk-in analytics, staff performance
- PDF export of reports opened as a clean standalone printable document
- Owner settings — gym info, membership plans, walk-in prices, and account management
- Gym logo upload via Cloudinary with dynamic branding across all pages
- A public self-service kiosk for member and walk-in check-in/check-out
- Role-based dashboards for Owner and Staff with URL persistence
- Unified login — auto-detects Owner (email) or Staff (username)

---

## How It Works

### Authentication Flow

The system uses a **unified login** — one input field that auto-detects the role:

| Input Format | Role Detected | Endpoint |
|---|---|---|
| Contains `@` (email) | Owner | `/api/auth/login/owner` |
| No `@` (username) | Staff | `/api/auth/login/staff` |

JWT tokens are issued on login and stored in the browser. All protected API routes require a valid Bearer token in the `Authorization` header. Tokens expire after 7 days.

### Member ID System

Every registered member is automatically assigned a unique `GYM-XXXX` ID (e.g., `GYM-0001`, `GYM-0042`). This ID is used for check-in, check-out, and kiosk access. IDs are sorted by creation date to prevent collision after GYM-999.

### Walk-In ID System

Walk-in passes are assigned a daily-resetting `WALK-XXX` ID (e.g., `WALK-001`). IDs reset to `WALK-001` each new day. Walk-ins can be checked out by staff at the counter or by the member themselves at the kiosk.

### Dynamic Plans System

Membership plans (Monthly, Quarterly, Annual, Student, and any custom plans) are stored in the `Settings.plans` collection — the single source of truth for pricing across the entire system. The owner can add custom plans (e.g., "Summer Promo"), edit prices and durations, deactivate plans, or delete custom plans from the Settings page. Default plans (Monthly, Quarterly, Annual, Student) cannot be deleted but can be deactivated. All pages read plan data from the `gymStore` Zustand store, which fetches from the `/api/auth/gym-info` endpoint.

### Walk-In Pricing

Walk-in pass prices (Regular, Student, Couple) are stored in `Settings.walkInPrices` and editable from the Settings page. The server reads prices from the database when registering walk-ins, and the frontend reads from `gymStore.getWalkInPrice()`.

### Payment System

All membership payments are recorded with:
- Payment method (Cash / Online)
- Payment type (New Member / Renewal / Manual / Balance Settlement)
- Partial payment support — member gets access, outstanding balance is tracked
- Cumulative balance — manual payments ADD to existing debt, never overwrite
- Plan change support — Log Payment modal can change a member's plan and extend their expiry
- Staff accountability — every payment is linked to the staff who processed it
- Grand total aggregation — backend returns total across all pages, not just current page
- Duplicate submission guard — 3-second cooldown on settle and log payment

### Revenue Tracking

Revenue is tracked across two streams:
- **Membership payments** — recorded in the Payments collection
- **Walk-in revenue** — recorded per walk-in session

Both streams are visible in the Reports page with period filters.

### Reports

The Reports page provides business intelligence for the owner:
- **Revenue Report** — totals, cash vs online split, daily trend chart, revenue source comparison (last 6 weeks), payment type breakdown
- **Member Report** — active/inactive/expired counts, member growth chart (6 months), loyalty duration ranking, outstanding balances, new members in period
- **Walk-in Report** — pass type breakdown with revenue per type (dynamic prices from gymStore)
- **Staff Performance** — payments processed, revenue collected, and walk-ins registered per staff member

**PDF Export** opens a clean standalone HTML document in a new tab with all charts rendered as SVG and A4 page margins set — sidebar, filters, and navigation are completely absent from the PDF.

### Gym Settings & Branding

The owner can manage all gym configuration from a full Settings page:
- **Gym Info** — name, address, and Cloudinary logo upload/delete
- **Membership Plans** — full CRUD for plans (add, edit price/duration, toggle active, delete custom plans)
- **Walk-in Prices** — editable Regular/Student/Couple day pass prices
- **Account** — change password and email

Changes are stored in the database and reflected immediately across all pages.

---

## User Roles

### Owner
- Full system access
- Manage members (create, edit, deactivate, reactivate)
- View all walk-ins (today with live pulse + history with search/filter)
- View payments with grand total, filters, date range shortcuts
- Log payments, settle outstanding balances
- View and export business reports (Revenue, Members, Walk-ins, Staff)
- Manage staff accounts (create, activate, deactivate)
- Manage membership plans (add, edit, deactivate, delete)
- Update walk-in prices
- Update account settings (password, email)
- Update gym info (name, address, logo)
- Owner dashboard with combined revenue, at-risk members with quick renew, members inside now (scroll capped), URL persistence

### Staff
- Limited access — day-to-day operations
- Check in and check out members with keyboard-driven flow (Enter to select + check in)
- Quick stats bar — members inside, walk-ins today, total activity
- At-risk members panel with Renew button for proactive renewals
- Register walk-in customers (auto-reset success card after 6 seconds)
- View and add members, edit member details, settle balances
- Log payments (today's view only — no historical data or revenue totals)
- Search members by name or GYM-ID (expired members flagged inline)
- Update own password via Settings
- URL persistence across page navigation
- Cannot access: reports, settings, payment history, deactivate/reactivate members

### Kiosk (Public — No Login Required)
- Self-service member check-in and check-out by GYM-ID or name
- Walk-in self-checkout by WALK-XXX ID
- Protected by machine-level token (X-Kiosk-Token header)
- Auto-resets after 8 seconds of inactivity
- Shows dynamic gym name in header and footer

---

## How to Use

### Owner

#### Logging In
1. Go to https://ironcore-gms.onrender.com
2. Enter your **email address** in the login field
3. Enter your password
4. Click **Enter the Gym**

#### Managing Members
1. Navigate to **Members** in the sidebar
2. Click **Add Member** to register a new gym member
3. Fill in name, email (optional), phone (optional), plan, expiry date, and payment method
4. Optionally enter a partial payment amount — outstanding balance is tracked
5. The system auto-generates a `GYM-XXXX` ID
6. Use the search bar and filters (Status / Plan) to find members
7. Click the edit icon to update member details
8. Click the amber **₱X owed** badge to settle a member's outstanding balance
9. Click the deactivate icon (owner only) to soft-delete a member

#### Viewing Walk-Ins
1. Navigate to **Walk-ins** in the sidebar
2. The **Today** tab shows all walk-ins with live status, duration, and staff accountability
3. The **History** tab allows search by guest name and filter by This Week / This Month / Custom range
4. Summary cards show revenue, still inside count, checked-out count, and pass breakdown

#### Managing Payments
1. Navigate to **Payments** in the sidebar
2. Filter by method (Cash/Online), type, outstanding only, or date range
3. Date range shortcuts — Today, This Week, This Month
4. Grand total shows the sum of all filtered records across all pages
5. Click **Log Payment** to manually record a payment — includes plan selector and extend membership toggle

#### Viewing Reports
1. Navigate to **Reports** in the sidebar
2. Select a period: Today / This Week / This Month / Custom range
3. All 4 sections load independently — Revenue, Members, Walk-ins, Staff
4. Click **Export PDF** to open a clean printable report in a new tab

#### Managing Plans
1. Navigate to **Settings** (click avatar → Settings)
2. The **Membership Plans** section shows all plans (active + inactive)
3. Click **Add Plan** to create a custom plan (name, price, duration)
4. Click the edit icon to change price or duration
5. Click the toggle icon to activate/deactivate a plan
6. Click delete to remove custom plans (default plans can only be deactivated)

#### Updating Walk-in Prices
1. In **Settings**, scroll to **Walk-in Day Passes**
2. Update Regular, Student, or Couple prices
3. Click **Save Walk-in Prices** — changes apply to new registrations immediately

#### Renewing At-Risk Members
1. On the **Dashboard**, the At-Risk Members panel shows expiring/overdue members
2. Click **Renew** on any member to open the Renew modal
3. Select plan, enter amount, choose payment method
4. Click **Confirm Renewal** — membership is extended and payment is logged

#### Owner Settings
1. Click the **avatar** in the top right or the **profile chip** in the sidebar
2. Click **Settings** — opens the full Settings page
3. **Gym Info:** Upload logo, update gym name and address
4. **Membership Plans:** Full CRUD for plans
5. **Walk-in Prices:** Update day pass pricing
6. **Account:** Change password or email (requires current password)

---

### Staff

#### Logging In
1. Go to https://ironcore-gms.onrender.com
2. Enter your **username** (no @) in the login field
3. Enter your password
4. Click **Enter the Gym**

#### Check-in Desk
1. The **Check-in Desk** is the default page
2. Quick stats bar shows Members Inside, Walk-ins Today, Total Activity
3. Type a name or GYM-ID in the search box — press **Enter** to auto-select if one result
4. Press **Enter** again to check in/out — or click the button
5. Expired/inactive members are flagged with "Cannot check in" in search results
6. Today's Log shows all check-in/out activity with timestamps
7. At-Risk Members panel shows expiring/overdue members — click **Renew** to process on the spot

#### Registering a Walk-In
1. Go to **Walk-in** in the sidebar
2. Enter the customer's full name and optional phone number
3. Select pass type — prices are dynamic from Settings
4. Click **Register** — success card auto-resets after 6 seconds
5. Give the `WALK-XXX` ID to the customer for kiosk self-checkout

#### Walk-in Checkout
1. Switch to the **Check Out** tab in the Walk-in page
2. See all walk-ins still inside today
3. Click **Check Out** next to the guest

#### Viewing & Adding Members
1. Go to **Members** in the sidebar
2. Search, filter, add new members, edit details, settle balances
3. Staff cannot deactivate/reactivate members (owner only)

#### Logging Payments
1. Go to **Payments** in the sidebar
2. Staff sees **today's payments only** — no historical data or revenue totals
3. Click **Log Payment** to record a payment for any member
4. Click the amber badge on a member row to settle outstanding balance

#### Staff Settings
1. Click the **avatar** in the top right
2. Click **Settings**
3. Change your password (requires current password)

---

### Kiosk (Public)

The kiosk is at: https://ironcore-gms.onrender.com/kiosk

#### Member Self Check-In / Check-Out
1. Type your name or GYM-ID in the search box
2. Select yourself from the results if multiple matches appear
3. Click **Check In** or **Check Out**
4. Confirmation appears and screen resets after 8 seconds

#### Walk-In Self Check-Out
1. Type your WALK-XXX ID (given by staff at registration)
2. Your pass details appear
3. Click **Check Out** — duration summary is shown

#### Kiosk Rules
- Expired or inactive memberships are blocked
- Already checked-in members cannot check in again
- Already checked-out walk-ins cannot check out again
- Screen auto-resets after 8 seconds of inactivity

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | 5.9 | Type safety |
| Vite | 6 | Build tool |
| Tailwind CSS | 4 | Styling |
| Zustand | 5 | State management (auth + gym settings + toast) |
| TanStack Query | 5 | Server state / data fetching |
| React Router | 7 | Client-side routing |
| Axios | 1.x | HTTP client |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime |
| Express | 5 | Web framework |
| TypeScript | 5.9 | Type safety |
| MongoDB Atlas | Cloud | Database |
| Mongoose | 8 | ODM |
| JWT | — | Authentication |
| bcrypt | — | Password hashing (12 salt rounds) |
| Zod | — | Input validation |
| Helmet | — | Security headers |
| express-rate-limit | — | Rate limiting |
| Cloudinary | — | Gym logo image storage |
| Multer | — | Multipart file upload handling |
| multer-storage-cloudinary | — | Cloudinary Multer storage adapter |

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- npm 10+
- MongoDB Atlas account
- Cloudinary account (free tier)

### 1. Clone the repository
```bash
git clone https://github.com/HarryBing162000/gym-management-system.git
cd gym-management-system
```

### 2. Set up the backend
```bash
cd server
npm install
cp .env.example .env   # fill in your values
npm run dev
```

### 3. Set up the frontend
```bash
cd client
npm install
cp .env.example .env   # fill in your values
npm run dev
```

### 4. Access the app
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Kiosk: http://localhost:5173/kiosk

---

## Environment Variables

### Backend (`server/.env`)

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `NODE_ENV` | Environment | `development` or `production` |
| `JWT_SECRET` | Secret for signing JWT tokens (min 32 chars) | `random_64_char_hex` |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `KIOSK_SECRET` | Machine token for kiosk routes (min 32 chars) | `random_32_char_hex` |
| `GYM_NAME` | Default gym name (fallback before settings saved) | `IronCore Gym` |
| `GYM_ADDRESS` | Default gym address (fallback) | `Antique` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `123456789` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your_api_secret` |

### Frontend (`client/.env`)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Backend base URL | `https://ironcore-gms-server.onrender.com` |
| `VITE_KIOSK_SECRET` | Must match backend `KIOSK_SECRET` | `same_value_as_backend` |

> ⚠️ Never commit `.env` files to Git. Always rotate secrets if accidentally exposed.

---

## API Endpoints

### Auth
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login/owner` | Public | Owner login via email |
| POST | `/api/auth/login/staff` | Public | Staff login via username |
| GET | `/api/auth/me` | JWT | Get current user |
| PUT | `/api/auth/update-password` | JWT | Change password (owner + staff) |
| PUT | `/api/auth/update-email` | JWT (Owner) | Change owner email |
| PUT | `/api/auth/update-gym` | JWT (Owner) | Update gym name and address |
| GET | `/api/auth/gym-info` | Public | Get gym name, address, logo, active plans, walk-in prices |
| POST | `/api/auth/upload-logo` | JWT (Owner) | Upload gym logo to Cloudinary |
| DELETE | `/api/auth/delete-logo` | JWT (Owner) | Delete gym logo from Cloudinary |
| GET | `/api/auth/plans` | JWT (Owner) | Get all plans (active + inactive) |
| POST | `/api/auth/plans` | JWT (Owner) | Add a new plan |
| PATCH | `/api/auth/plans/:planId` | JWT (Owner) | Update plan (price, duration, active, name) |
| DELETE | `/api/auth/plans/:planId` | JWT (Owner) | Delete custom plan (default plans blocked) |
| PUT | `/api/auth/walkin-prices` | JWT (Owner) | Update walk-in pass prices |

### Staff Management
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/auth/staff` | JWT (Owner) | List all staff accounts |
| POST | `/api/auth/register/staff` | JWT (Owner) | Create staff account |
| PATCH | `/api/auth/staff/:id/deactivate` | JWT (Owner) | Deactivate staff |
| PATCH | `/api/auth/staff/:id/reactivate` | JWT (Owner) | Reactivate staff |

### Members
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/members` | JWT | List members (paginated, filterable, checkedIn filter) |
| GET | `/api/members/stats` | JWT | Dashboard stats (total, checkedIn, expiringSoon, withBalance) |
| GET | `/api/members/at-risk` | JWT | Expiring/overdue members for at-risk panel |
| POST | `/api/members` | JWT | Create member + auto-log payment |
| GET | `/api/members/:gymId` | JWT | Get member by GYM-ID |
| PATCH | `/api/members/:gymId` | JWT | Update member details / renew membership |
| PATCH | `/api/members/:gymId/deactivate` | JWT (Owner) | Soft-delete member |
| PATCH | `/api/members/:gymId/reactivate` | JWT (Owner) | Restore member |
| PATCH | `/api/members/:gymId/checkin` | JWT | Staff desk check-in |
| PATCH | `/api/members/:gymId/checkout` | JWT | Staff desk check-out |

### Walk-Ins
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/walkin/register` | JWT | Register walk-in (price from Settings) |
| GET | `/api/walkin/today` | JWT | Today's walk-ins + summary |
| GET | `/api/walkin/yesterday-revenue` | JWT (Owner) | Yesterday's revenue for comparison |
| GET | `/api/walkin/history` | JWT (Owner) | Walk-in history with date range filters |
| PATCH | `/api/walkin/checkout` | JWT | Staff counter checkout |
| POST | `/api/walkin/kiosk-checkout` | Public | Kiosk self-checkout |

### Payments
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/payments` | JWT | List payments (paginated + grandTotal + date filter) |
| POST | `/api/payments` | JWT | Log manual payment (with plan change + renewExpiry support) |
| GET | `/api/payments/summary` | JWT | Today / week / month revenue summary |
| POST | `/api/payments/:gymId/settle` | JWT | Settle outstanding member balance |

### Kiosk (X-Kiosk-Token required)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/kiosk/search?q=` | Search members and walk-ins |
| POST | `/api/kiosk/member/checkin` | Member self check-in |
| POST | `/api/kiosk/member/checkout` | Member self check-out |
| GET | `/api/kiosk/walkin/:walkId` | Walk-in lookup |
| POST | `/api/kiosk/walkin/checkout` | Walk-in self check-out |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server health check |

---

## Security

IronCore GMS implements multiple security layers:

- **Helmet** — Secure HTTP headers (XSS, clickjacking, MIME sniffing protection)
- **CORS** — Only whitelisted origins can call the API
- **Rate Limiting** — 10 login attempts per 15 minutes per IP, 300 general requests per 15 minutes
- **JWT Authentication** — All protected routes require valid signed tokens
- **Role-Based Access** — Owner and staff have different permissions enforced both client-side and server-side
- **Kiosk Token Auth** — Public kiosk routes protected by machine-level `X-Kiosk-Token` header using timing-safe comparison
- **bcrypt** — Passwords hashed with 12 salt rounds
- **Zod Validation** — All inputs validated against strict schemas with dynamic plan name support
- **NoSQL Injection Protection** — MongoDB operators stripped from all inputs via manual sanitizer (replaces express-mongo-sanitize which is incompatible with Express 5)
- **HPP Protection** — HTTP parameter pollution prevention
- **Input Sanitization** — XSS characters stripped from all request bodies
- **File Upload Validation** — Logo uploads restricted to image types and 2MB max size

---

## Deployment

### Frontend — Render Static Site
- **Root directory:** `client`
- **Build command:** `npm run build`
- **Publish directory:** `dist`
- Add `VITE_API_URL` and `VITE_KIOSK_SECRET` as environment variables
- Add rewrite rule: `/*` → `/index.html` (Rewrite) for React Router support

### Backend — Render Web Service
- **Root directory:** `server`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- Add all `server/.env` variables as environment variables on Render
- Set `NODE_ENV=production`

### Database — MongoDB Atlas
- Free M0 cluster on Atlas
- Whitelist Render's IP in Network Access (upgrade to static IP on paid plan)
- Rotate database user password before going to production

### Image Storage — Cloudinary
- Free tier (25GB storage)
- Logos stored under `ironcore-gms/logos/` folder
- Images auto-resized to max 400×400 on upload
- Old logos deleted from Cloudinary when replaced

### Uptime Monitoring — UptimeRobot
- Monitors `/api/health` every 5 minutes
- Keeps Render free tier backend from sleeping
- Also monitor the frontend URL to prevent static site cold starts

---

## Changelog

### Session 3 — Owner Audit + Dynamic Plans + Staff Enhancement

#### Dynamic Plans System
- ✅ `Settings.plans` is now the single source of truth for all membership pricing
- ✅ `PlansManager` component — full CRUD UI for plans (add, edit price/duration, toggle active, delete custom plans)
- ✅ Default plans (Monthly, Quarterly, Annual, Student) cannot be deleted, only deactivated
- ✅ `gymStore` updated with `getActivePlans()`, `getPlanPrice()`, `getPlanDuration()` helpers
- ✅ All hardcoded `PLAN_PRICES` / `PLAN_DURATIONS` removed from entire codebase
- ✅ `Member.plan` and `Payment.plan` changed from enum to `String` for dynamic plan names
- ✅ Zod schemas updated from `z.enum()` to `z.string()` for plan validation

#### Walk-in Prices Centralization
- ✅ `Settings.walkInPrices` — editable Regular/Student/Couple prices
- ✅ `walkInController.getPassAmount()` reads from Settings DB instead of hardcoded values
- ✅ `gymStore.getWalkInPrice()` helper used across WalkInsPage, StaffDashboard, ReportsPage
- ✅ `PUT /api/auth/walkin-prices` endpoint for owner to update prices
- ✅ Walk-in Prices section added to SettingsPage

#### Owner Audit Fixes
- ✅ `memberController.getMembers` — `isActive: true` default filter, plan filter accepts any string
- ✅ `memberController.generateGymId` — sorted by `createdAt` instead of string sort
- ✅ `memberController.reactivateMember` — checks `expiresAt` before setting status
- ✅ `paymentController.createPayment` — plan validation against Settings DB, amount validation, deactivated member check, duplicate guard, cumulative balance
- ✅ `paymentController.autoLogPayment` — `totalAmountOverride` param, always resets balance
- ✅ Renewal snapshot fix — `oldExpiresAt` saved BEFORE update to prevent self-comparison
- ✅ Zod `updateMemberSchema` — added `paymentMethod`, `amountPaid`, `totalAmount` passthrough
- ✅ Settings auto-seed on first boot with default plans + walk-in prices + migration for existing settings
- ✅ `memberRoutes.ts` — added `/stats` and `/at-risk` routes BEFORE `/:gymId`

#### Owner Dashboard
- ✅ `useSearchParams` for URL persistence across page navigation
- ✅ `getMemberStats()` and `getAtRiskMembers()` — single API calls replace 4-call client-side computation
- ✅ RenewModal with dynamic plans from gymStore
- ✅ Members Inside Now — 480px max height with scroll, no per-member pulse dots
- ✅ At-Risk panel — 240px scroll cap, renew button on each member

#### Settings Page (full page, replaces old modal)
- ✅ Gym Info — name, address, Cloudinary logo upload/delete
- ✅ Membership Plans — PlansManager with add/edit/toggle/delete
- ✅ Walk-in Day Passes — editable Regular/Student/Couple prices
- ✅ Account — change password and email
- ✅ OwnerLayout Settings button navigates to full page (deleted ~430 lines of dead SettingsModal)

#### Log Payment Modal Enhancement
- ✅ Reads dynamic plans from gymStore (no hardcoded prices)
- ✅ Plan selector with plan change support
- ✅ "Extend membership" toggle — auto-ON for expired/expiring members
- ✅ Shows member expiry, status, outstanding balance when selected
- ✅ Search dropdown shows expiry status per result
- ✅ Overpayment cap, amount validation, duplicate submission guard
- ✅ Backend `createPayment` accepts `plan` + `renewExpiry` flag

#### PaymentsPage Date Filter Fix
- ✅ `activeDatePreset` state tracks which button was clicked (fixes Today + This Week both highlighting on Mondays)

#### UI Polish
- ✅ SVG nav icons (Feather/Lucide style) replacing geometric characters in both OwnerLayout and StaffLayout
- ✅ `animate-ping` Live badge in header and Members Inside Now card
- ✅ MembersPage — owed badge in member info column, fixed 100px actions column

#### Staff Enhancement
- ✅ URL persistence with `useSearchParams`
- ✅ Quick stats bar — Members Inside, Walk-ins Today, Total Activity
- ✅ At-Risk panel moved to left column under Member Lookup with Renew button + StaffRenewModal
- ✅ Keyboard-driven check-in — Enter to select first result, Enter again to check in/out
- ✅ Expired/inactive members flagged inline in search results ("Cannot check in")
- ✅ `checkedIn: "true"` server-side filter replaces client-side filtering of 100 members
- ✅ Walk-in auto-reset — success card resets after 6 seconds
- ✅ Payments page (staff view) — today only, no revenue overview, no date pickers, no grand total
- ✅ Staff Clear All only resets search/method/type, never breaks date lock
- ✅ Payments nav item added to StaffLayout (4 nav items total)
- ✅ Layout restructured — left: Lookup + At-Risk, right: Today's Log (full height, items-stretch)

---

### Session 2 — UI/UX Audit + Reports Page

#### Pages Rewritten
- ✅ **WalkInsPage** — unified filter card, search in history, dynamic summary label, Status column, pass breakdown labels, `< 1m` duration fix, page number pagination, extracted `Pagination` and `WalkInRow` components
- ✅ **MembersPage** — unified filter card with Clear All, zebra striping, hover highlight, table footer with record count, page number pagination, consistent action button sizes
- ✅ **PaymentsPage** — grand total fixed (backend aggregation via `Payment.aggregate`), filter card with date shortcuts, page number pagination, table footer
- ✅ **OwnerDashboard** — gym name from `gymStore`, quick action buttons, Members Inside Now grid, Outstanding Balances card, At-Risk Members green state, clickable stat cards
- ✅ **ReportsPage** — brand new page with 4 sections, 3 CSS-only charts, PDF export

#### Reports Page — Features
- ✅ Revenue Report — totals, cash vs online split bar, range-aware dual bar chart (revenue + walk-ins), revenue source comparison last 6 weeks, payment type breakdown with bars
- ✅ Member Report — active/inactive/expired counts, 6-month growth chart, outstanding balances list, loyalty duration ranking with progress bars, new members in selected period
- ✅ Walk-in Report — total, revenue, pass type breakdown with percentage bars
- ✅ Staff Performance — ranked table with mini revenue bar per staff, totals row
- ✅ Combined revenue hero card — most important number at the top
- ✅ Two-column layout on desktop — Revenue + Member, Walk-in + Staff
- ✅ Per-section independent loading and error states
- ✅ Date range filter — Today / This Week / This Month / Custom with day count
- ✅ New Members count and list respects selected date range (not hardcoded "this month")
- ✅ PDF export — standalone HTML popup with inline SVG charts, A4 page margins, no sidebar

#### Backend Fix
- ✅ `paymentController.getPayments` — added `Payment.aggregate` to return `grandTotal` alongside paginated results

---

### Session 1 — Security & Deployment
- ✅ Migrated frontend from Netlify to Render Static Site
- ✅ Owner and Staff Settings modals (password, email, gym name, address, logo)
- ✅ Gym logo upload via Cloudinary with dynamic branding
- ✅ Unified login page — auto-detects Owner vs Staff
- ✅ Dynamic document title with gym name
- ✅ KioskPage fully redesigned — centered layout, clock hero, inline styles for Tailwind v4 compatibility
- ✅ Global Zustand toast notification system
- ✅ Login success and logout confirm modals
- ✅ `StaffDashboard` rewired to live API with debounced member search
- ✅ Walk-in checkout tab added to `WalkInDesk`
- ✅ Responsive viewport setup with `@source` fix for Tailwind v4
- ✅ Removed `.env` files from Git, rotated all secrets
- ✅ Rate limiting, CORS, security headers confirmed in production
- ✅ UptimeRobot monitoring both URLs every 5 minutes
- ✅ Manual NoSQL sanitizer replacing express-mongo-sanitize (Express 5 incompatibility)
- ✅ Hard duplicate blocking on member name, email, phone
- ✅ `User.findOne({ email: undefined })` false-match bug fixed
- ✅ GYM-ID search regex bug fixed (exact-match → starts-with pattern)

---

## Upcoming — Next Session
- 🔲 **Action Log** — track all staff/owner actions (check-in, payments, member changes, settings updates, login/logout) with `ActionLog` MongoDB model. Owner sees all actions; staff sees only their own.

---

* GMS — Built with ⚡ by Harry Bing Raba II*
