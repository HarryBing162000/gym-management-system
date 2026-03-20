# ⚡ IronCore GMS — Gym Management System

A full-stack gym management system with role-based access, member management, walk-in tracking, and a public self-service kiosk.

**Live URLs**

- Frontend: https://ironcore-gms.netlify.app
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

---

## System Overview

IronCore GMS is a web-based gym management system designed to handle day-to-day operations including:

- Member registration, check-in, and check-out
- Walk-in pass management (Regular and Student pricing)
- Staff management and accountability tracking
- Revenue tracking and payment records
- A public self-service kiosk for member and walk-in check-in/check-out
- Role-based dashboards for Owner and Staff

---

## How It Works

### Authentication Flow

The system has three login types, each with a different identifier:

| Role   | Login Method        | Identifier    |
| ------ | ------------------- | ------------- |
| Owner  | Email + Password    | Email address |
| Staff  | Username + Password | Username      |
| Member | Kiosk only          | GYM-XXXX ID   |

JWT tokens are issued on login and stored in the browser. All protected API routes require a valid Bearer token in the `Authorization` header. Tokens expire after 7 days.

### Member ID System

Every registered member is automatically assigned a unique `GYM-XXXX` ID (e.g., `GYM-0001`, `GYM-0042`). This ID is used for check-in, check-out, and kiosk access.

### Walk-In ID System

Walk-in passes are assigned a daily-resetting `WALK-XXX` ID (e.g., `WALK-001`). IDs reset to `WALK-001` each new day. Walk-ins can be checked out by staff at the counter or by the member themselves at the kiosk.

### Revenue Tracking

All walk-in payments and member payments are recorded with timestamps, staff accountability, and pass type. The owner dashboard provides a daily revenue summary.

---

## User Roles

### Owner

- Full system access
- Manage members (create, edit, view, delete)
- View all walk-ins (today and history)
- View payments and revenue
- Manage staff accounts
- Access daily revenue summaries

### Staff

- Limited access — day-to-day operations only
- Register walk-in customers
- Check in and check out members
- Search members by name or GYM-ID
- Cannot access owner-level reports or settings

### Kiosk (Public — No Login Required)

- Self-service member check-in and check-out by GYM-ID or name
- Walk-in self-checkout by WALK-XXX ID
- Protected by machine-level token (X-Kiosk-Token header)
- Auto-resets after 5.5 seconds of inactivity

---

## How to Use

### Owner

#### Logging In

1. Go to https://ironcore-gms.netlify.app
2. Select the **OWNER** tab
3. Enter your email address and password
4. Click **Enter the Gym**

#### Managing Members

1. Navigate to **Members** in the sidebar
2. Click **Add Member** to register a new gym member
3. Fill in name, email, phone, plan, and membership dates
4. The system auto-generates a `GYM-XXXX` ID
5. Use the search bar to find members by name, email, or GYM-ID
6. Click a member to view details, edit, or delete

#### Viewing Walk-Ins

1. Navigate to **Walk-Ins** in the sidebar
2. The **Today** tab shows all walk-ins for the current day with live status
3. The **History** tab shows past walk-in records
4. Summary cards show total walk-ins, revenue, and checked-out count

#### Managing Staff

1. Navigate to **Staff** in the sidebar
2. Add new staff accounts with username and password
3. View and manage existing staff members

#### Viewing Payments

1. Navigate to **Payments** in the sidebar
2. View all payment records with date, amount, type, and staff accountability

---

### Staff

#### Logging In

1. Go to https://ironcore-gms.netlify.app
2. Select the **STAFF** tab
3. Enter your username and password
4. Click **Enter the Gym**

#### Registering a Walk-In

1. Go to **Walk-In Desk** in the dashboard
2. Enter the customer's name
3. Select pass type: **Regular** or **Student**
4. Click **Register Walk-In**
5. A `WALK-XXX` ID is assigned and receipt is shown
6. Inform the customer of their WALK-ID for kiosk self-checkout

#### Checking In a Member

1. Go to **Member Check-In** in the dashboard
2. Search by name or GYM-ID
3. Select the member from results
4. Click **Check In**

#### Checking Out a Member

1. Search for the member by name or GYM-ID
2. Click **Check Out**

#### Walk-In Counter Checkout

1. Go to the **Walk-In Checkout** tab
2. Enter the customer's WALK-XXX ID
3. Click **Check Out**

---

### Kiosk (Public)

The kiosk is a public self-service terminal at https://ironcore-gms.netlify.app/kiosk

#### Member Self Check-In

1. Type your name or GYM-ID in the search box
2. Select yourself from the results list (if multiple matches)
3. Click **Check In**
4. Confirmation message appears and screen resets after 5 seconds

#### Member Self Check-Out

1. Type your name or GYM-ID in the search box
2. Select yourself from the results
3. Click **Check Out**

#### Walk-In Self Check-Out

1. Type your WALK-XXX ID (given to you by staff at registration)
2. Your pass details will appear
3. Click **Check Out**
4. Duration summary is shown

#### Kiosk Rules

- Expired or inactive memberships are blocked — see front desk
- Already checked in members cannot check in again
- Already checked out walk-ins cannot check out again
- Screen auto-resets after 5.5 seconds of inactivity

---

## Tech Stack

### Frontend

| Technology     | Version | Purpose                      |
| -------------- | ------- | ---------------------------- |
| React          | 19      | UI framework                 |
| TypeScript     | 5.9     | Type safety                  |
| Vite           | 6       | Build tool                   |
| Tailwind CSS   | 4       | Styling                      |
| Zustand        | 5       | State management             |
| TanStack Query | 5       | Server state / data fetching |
| React Router   | 7       | Client-side routing          |
| Axios          | 1.x     | HTTP client                  |

### Backend

| Technology         | Version | Purpose          |
| ------------------ | ------- | ---------------- |
| Node.js            | 20+     | Runtime          |
| Express            | 5       | Web framework    |
| TypeScript         | 5.9     | Type safety      |
| MongoDB Atlas      | Cloud   | Database         |
| Mongoose           | 8       | ODM              |
| JWT                | —       | Authentication   |
| bcrypt             | —       | Password hashing |
| Zod                | —       | Input validation |
| Helmet             | —       | Security headers |
| express-rate-limit | —       | Rate limiting    |

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- npm 10+
- MongoDB Atlas account (or local MongoDB)

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

| Variable         | Description                                  | Example                       |
| ---------------- | -------------------------------------------- | ----------------------------- |
| `PORT`           | Server port                                  | `5000`                        |
| `MONGODB_URI`    | MongoDB Atlas connection string              | `mongodb+srv://...`           |
| `NODE_ENV`       | Environment                                  | `development` or `production` |
| `JWT_SECRET`     | Secret for signing JWT tokens (min 32 chars) | `random_64_char_hex`          |
| `JWT_EXPIRES_IN` | Token expiry                                 | `7d`                          |
| `KIOSK_SECRET`   | Machine token for kiosk routes               | `random_32_char_hex`          |
| `GYM_NAME`       | Gym name for display                         | `IronCore Gym`                |
| `GYM_ADDRESS`    | Gym address                                  | `Antique`                     |

### Frontend (`client/.env`)

| Variable            | Description                       | Example                                    |
| ------------------- | --------------------------------- | ------------------------------------------ |
| `VITE_API_URL`      | Backend base URL                  | `https://ironcore-gms-server.onrender.com` |
| `VITE_KIOSK_SECRET` | Must match backend `KIOSK_SECRET` | `same_value_as_backend`                    |

> ⚠️ Never commit `.env` files to Git. Always rotate secrets if accidentally exposed.

---

## API Endpoints

### Auth

| Method | Endpoint                | Access | Description      |
| ------ | ----------------------- | ------ | ---------------- |
| POST   | `/api/auth/login/owner` | Public | Owner login      |
| POST   | `/api/auth/login/staff` | Public | Staff login      |
| GET    | `/api/auth/me`          | JWT    | Get current user |

### Members

| Method | Endpoint           | Access      | Description      |
| ------ | ------------------ | ----------- | ---------------- |
| GET    | `/api/members`     | JWT         | List all members |
| POST   | `/api/members`     | JWT (Owner) | Create member    |
| GET    | `/api/members/:id` | JWT         | Get member       |
| PUT    | `/api/members/:id` | JWT (Owner) | Update member    |
| DELETE | `/api/members/:id` | JWT (Owner) | Delete member    |

### Walk-Ins

| Method | Endpoint               | Access      | Description            |
| ------ | ---------------------- | ----------- | ---------------------- |
| POST   | `/api/walkin`          | JWT (Staff) | Register walk-in       |
| GET    | `/api/walkin/today`    | JWT         | Today's walk-ins       |
| GET    | `/api/walkin/history`  | JWT (Owner) | Walk-in history        |
| POST   | `/api/walkin/checkout` | JWT (Staff) | Staff counter checkout |
| GET    | `/api/walkin/summary`  | JWT (Owner) | Daily revenue summary  |

### Kiosk (Machine Auth — X-Kiosk-Token required)

| Method | Endpoint                     | Description                 |
| ------ | ---------------------------- | --------------------------- |
| GET    | `/api/kiosk/search?q=`       | Search members and walk-ins |
| POST   | `/api/kiosk/member/checkin`  | Member self check-in        |
| POST   | `/api/kiosk/member/checkout` | Member self check-out       |
| GET    | `/api/kiosk/walkin/:walkId`  | Walk-in lookup              |
| POST   | `/api/kiosk/walkin/checkout` | Walk-in self check-out      |

### Health

| Method | Endpoint      | Description         |
| ------ | ------------- | ------------------- |
| GET    | `/api/health` | Server health check |

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
- **NoSQL Injection Protection** — MongoDB operators stripped from all inputs
- **HPP Protection** — HTTP parameter pollution prevention
- **Input Sanitization** — XSS characters stripped from all request bodies

---

## Deployment

### Frontend — Netlify

- **Base directory:** `client`
- **Build command:** `npm run build`
- **Publish directory:** `client/dist`
- Add `VITE_API_URL` and `VITE_KIOSK_SECRET` as environment variables

### Backend — Render

- **Root directory:** `server`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- Add all `server/.env` variables as environment variables on Render
- Set `NODE_ENV=production`

### Database — MongoDB Atlas

- Free M0 cluster on Atlas
- Whitelist Render's IP in Network Access (or use static IP on paid plan)
- Rotate database user password before going to production

---

_IronCore GMS — Built with ⚡ by Harry Bing Raba II_
