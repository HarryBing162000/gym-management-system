# ⚡ IronCore GMS — Gym Management System

A full-stack gym management system with role-based access, member management, walk-in tracking, payments, business reports, owner settings, logo branding, and a public self-service kiosk.

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
- Walk-in pass management (Regular, Student, and Couple pricing)
- Staff management and accountability tracking
- Payment recording with cash/online split, partial payments, and balance settlement
- Business reports — revenue, member loyalty, walk-in analytics, staff performance
- PDF export of reports opened as a clean standalone printable document
- Owner settings — change password, email, gym name, address, and logo
- Gym logo upload via Cloudinary with dynamic branding across all pages
- A public self-service kiosk for member and walk-in check-in/check-out
- Role-based dashboards for Owner and Staff
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

Every registered member is automatically assigned a unique `GYM-XXXX` ID (e.g., `GYM-0001`, `GYM-0042`). This ID is used for check-in, check-out, and kiosk access.

### Walk-In ID System

Walk-in passes are assigned a daily-resetting `WALK-XXX` ID (e.g., `WALK-001`). IDs reset to `WALK-001` each new day. Walk-ins can be checked out by staff at the counter or by the member themselves at the kiosk.

### Payment System

All membership payments are recorded with:
- Payment method (Cash / Online)
- Payment type (New Member / Renewal / Manual / Balance Settlement)
- Partial payment support — member gets access, outstanding balance is tracked
- Staff accountability — every payment is linked to the staff who processed it
- Grand total aggregation — backend returns total across all pages, not just current page

### Revenue Tracking

Revenue is tracked across two streams:
- **Membership payments** — recorded in the Payments collection
- **Walk-in revenue** — recorded per walk-in session

Both streams are visible in the Reports page with period filters.

### Reports

The Reports page provides business intelligence for the owner:
- **Revenue Report** — totals, cash vs online split, daily trend chart, revenue source comparison (last 6 weeks), payment type breakdown
- **Member Report** — active/inactive/expired counts, member growth chart (6 months), loyalty duration ranking, outstanding balances, new members in period
- **Walk-in Report** — pass type breakdown with revenue per type
- **Staff Performance** — payments processed, revenue collected, and walk-ins registered per staff member

**PDF Export** opens a clean standalone HTML document in a new tab with all charts rendered as SVG and A4 page margins set — sidebar, filters, and navigation are completely absent from the PDF.

### Gym Settings & Branding

The owner can update gym name, address, and logo from the Settings modal. Changes are stored in the database and reflected immediately across all pages — sidebar, login page, and kiosk header.

---

## User Roles

### Owner
- Full system access
- Manage members (create, edit, deactivate, reactivate)
- View all walk-ins (today with live pulse + history with search/filter)
- View payments with grand total, filters, date range shortcuts
- View and export business reports (Revenue, Members, Walk-ins, Staff)
- Manage staff accounts (create, activate, deactivate)
- Settle outstanding member balances
- Update account settings (password, email)
- Update gym info (name, address, logo)
- Owner dashboard with combined revenue, at-risk members, members inside now

### Staff
- Limited access — day-to-day operations only
- Register walk-in customers
- Check in and check out members
- Search members by name or GYM-ID
- View walk-in desk and member check-in panel
- Update own password via Settings
- Cannot access owner-level reports or settings

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
5. History includes a Status column — Checked Out (green) or Inside (orange)

#### Managing Payments
1. Navigate to **Payments** in the sidebar
2. Filter by method (Cash/Online), type, outstanding only, or date range
3. Date range shortcuts — Today, This Week, This Month
4. Grand total shows the sum of all filtered records across all pages
5. Click **Log Payment** to manually record a payment for any member

#### Viewing Reports
1. Navigate to **Reports** in the sidebar
2. Select a period: Today / This Week / This Month / Custom range
3. All 4 sections load independently — Revenue, Members, Walk-ins, Staff
4. Click **Export PDF** to open a clean printable report in a new tab
5. Use the browser's Print dialog (Ctrl+P / Cmd+P) to save as PDF

#### Settling Outstanding Balances
1. In **Members**, find a member with an amber **₱X owed** badge
2. Click the badge to open the Settle Balance modal
3. Choose Cash or Online, optionally enter a partial amount
4. Click **Settle ✓** — balance is updated immediately

#### Owner Settings
1. Click the **avatar** in the top right or the **profile chip** in the sidebar
2. Click **Settings** from the dropdown
3. **Account tab:** Change password or email (requires current password)
4. **Gym Info tab:** Upload logo, update gym name and address, remove existing logo

---

### Staff

#### Logging In
1. Go to https://ironcore-gms.onrender.com
2. Enter your **username** (no @) in the login field
3. Enter your password
4. Click **Enter the Gym**

#### Registering a Walk-In
1. Go to **Walk-In Desk** in the dashboard
2. Enter the customer's full name and optional phone number
3. Select pass type: **Regular (₱150)**, **Student (₱100)**, or **Couple (₱250)**
4. Click **Register**
5. A `WALK-XXX` ID is assigned — give this to the customer for kiosk self-checkout

#### Checking In / Out a Member
1. Go to **Member Check-In** in the dashboard
2. Search by name or GYM-ID
3. Select the member from results
4. Click **Check In** or **Check Out**

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
| GET | `/api/auth/gym-info` | Public | Get gym name, address, logo URL |
| POST | `/api/auth/upload-logo` | JWT (Owner) | Upload gym logo to Cloudinary |
| DELETE | `/api/auth/delete-logo` | JWT (Owner) | Delete gym logo from Cloudinary |

### Members
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/members` | JWT | List members (paginated, filterable) |
| POST | `/api/members` | JWT | Create member + auto-log payment |
| GET | `/api/members/:gymId` | JWT | Get member by GYM-ID |
| PATCH | `/api/members/:gymId` | JWT | Update member details |
| PATCH | `/api/members/:gymId/deactivate` | JWT (Owner) | Soft-delete member |
| PATCH | `/api/members/:gymId/reactivate` | JWT (Owner) | Restore member |
| PATCH | `/api/members/:gymId/checkin` | JWT | Staff desk check-in |
| PATCH | `/api/members/:gymId/checkout` | JWT | Staff desk check-out |

### Walk-Ins
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/walkin/register` | JWT | Register walk-in |
| GET | `/api/walkin/today` | JWT | Today's walk-ins + summary |
| GET | `/api/walkin/yesterday` | JWT | Yesterday's revenue for comparison |
| GET | `/api/walkin/history` | JWT (Owner) | Walk-in history with filters |
| PATCH | `/api/walkin/:walkId/checkout` | JWT | Staff counter checkout |

### Payments
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/payments` | JWT (Owner) | List payments (paginated + grandTotal) |
| POST | `/api/payments` | JWT | Log manual payment |
| GET | `/api/payments/summary` | JWT (Owner) | Today / week / month revenue summary |
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
- **Kiosk Token Auth** — Public kiosk routes protected by machine-level `X-Kiosk-Token` header using timing-safe comparison
- **bcrypt** — Passwords hashed with 12 salt rounds
- **Zod Validation** — All inputs validated against strict schemas
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

### Current Session — UI/UX Audit + Reports Page

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

#### Bug Fixes
- ✅ Babel JSX parse error — `.reduce<(number | "...")[]>` generic syntax breaks Babel; replaced with parameter type annotation + cast
- ✅ JSX structure error — sibling elements outside fragment wrapper in Today tab; extracted `Pagination` component to prevent nesting issues
- ✅ `withBalance` unused state removed from ReportsPage
- ✅ Walk-in revenue estimate in PDF uses weighted average price per pass type instead of hardcoded ₱150

---

### Previous Session — Security & Deployment
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

*IronCore GMS — Built with ⚡ by Harry Bing Raba II*
