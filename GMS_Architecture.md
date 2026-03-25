# GMS Architecture Deep-Dive
## How the Gym Management System Actually Works

> This document is written for someone who wants to fully understand the system — not just what files exist, but *why* they exist, how they connect, and what happens step by step when anything occurs.

---

## Part 1 — The Big Mental Model

Before looking at any files, you need one mental model in your head:

```
Browser (React)  ←→  Node.js Server (Express)  ←→  MongoDB Atlas (Database)
```

The browser never talks to the database directly. It always goes through the server. The server is the gatekeeper — it checks who you are, what you're allowed to do, and then reads or writes the database.

**Three environments:**
- **Local dev** — browser at `localhost:5173`, server at `localhost:5000`, database on MongoDB Atlas
- **Production** — browser at `ironcore-gms.onrender.com`, server at `ironcore-gms-server.onrender.com`, same Atlas database
- **Kiosk** — browser at `/kiosk` route, same server, no login required

---

## Part 2 — How a Request Travels (The Full Journey)

Let's trace what happens when a staff member checks in a gym member. This single action touches 8 files.

### Step 1: Staff presses "Check In" button
**File:** `client/src/pages/StaffDashboard.tsx`

```
StaffDashboard → memberService.checkIn(gymId)
```

The component calls the service function. It doesn't know or care about HTTP — it just calls a function.

### Step 2: Service function makes the HTTP call
**File:** `client/src/services/memberService.ts`

```
memberService.checkIn → api.patch('/members/GYM-1023/checkin')
```

This calls `api.patch()` — the central Axios instance.

### Step 3: Axios attaches the JWT token automatically
**File:** `client/src/services/api.ts`

```javascript
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Every single request going out gets the JWT token attached here. The staff member logged in earlier and their token was saved in `authStore`. This interceptor reads it and attaches it automatically — no manual work needed anywhere else.

### Step 4: Request hits the server router
**File:** `server/src/routes/memberRoutes.ts`

```
PATCH /api/members/:gymId/checkin → [protect middleware] → checkInMember controller
```

The router is just a map. It says: "if this URL pattern comes in, run these functions in this order." First the `protect` middleware, then the controller.

### Step 5: Middleware verifies the JWT
**File:** `server/src/middleware/authMiddleware.ts`

```javascript
const decoded = jwt.verify(token, process.env.JWT_SECRET);
req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
next();
```

The middleware extracts the token from the `Authorization` header, verifies its signature, and attaches the user to `req`. If the token is missing or invalid, it returns `401` immediately and the request never reaches the controller.

### Step 6: Controller does the actual work
**File:** `server/src/controllers/memberController.ts`

```javascript
const member = await Member.findOne({ gymId });
// check: is member active? already checked in?
member.checkedIn = true;
member.lastCheckIn = new Date();
await member.save();
await logAction({ action: 'check_in', ... });
return res.status(200).json({ success: true, ... });
```

This is where the real logic lives. It reads from MongoDB, validates business rules, writes back, logs the action, and sends the response.

### Step 7: Response travels back
The `200 OK` response travels back through Express → network → Axios → `memberService.checkIn()` → `StaffDashboard`.

### Step 8: UI updates
StaffDashboard gets the success response, calls `fetchMembers()` to refresh the list, and shows a toast notification via `toastStore`.

**That's the full round trip.** Every feature in this system follows this same path.

---

## Part 3 — Authentication Deep-Dive

Authentication is the most important thing to understand. Everything else depends on it.

### How login works

```
LoginPage → authService.login(email, password)
         → POST /api/auth/login
         → authController finds User by email
         → bcrypt.compare(password, user.passwordHash)
         → jwt.sign({ id, role, name }, JWT_SECRET, { expiresIn: '7d' })
         → returns { token, user }
         → authStore.setAuth(user, token)
         → token stored in localStorage via Zustand persist
```

The JWT is a signed string. It contains `{ id, role, name }` but crucially it is **signed** with `JWT_SECRET`. Nobody can fake a JWT without knowing the secret.

### What's inside the JWT

```
Header.Payload.Signature

Payload: { id: "abc123", role: "staff", name: "John Doe", iat: 1234567890, exp: 1234567890 }
```

The server never needs to look up the database to verify identity on every request. It just checks the signature. If valid → user is who they claim to be.

### Why name is in the JWT

`logAction()` needs the performer's name to record it in the action log. If name wasn't in the JWT, every single logged action would need a `User.findById()` call to get the name. By including name in the JWT payload, we save a database round trip on every action.

### How logout works

This is a special case because logout needs to be logged BEFORE the token is cleared:

```javascript
// authStore.ts
logout: () => {
  const { user, token } = get();  // grab BEFORE clearing
  
  if (user && token) {
    api.post('/action-logs/logout', {}, {
      headers: { Authorization: `Bearer ${token}` }  // pass explicitly
    }).catch(() => {});  // fire-and-forget
  }
  
  set({ user: null, token: null, isAuthenticated: false });  // clear AFTER
}
```

If we cleared the token first, the logout log request would fail authentication (401). So we grab the token, fire the log request, then clear the state.

### Role-based access

Three roles exist: `owner`, `staff`, `member`. Members don't have User accounts — they only use the kiosk. The `protect` middleware blocks unauthenticated users. The `requireRole()` middleware blocks wrong roles:

```javascript
// Only owner can access this route
router.get('/staff', protect, requireRole('owner'), getStaffList);
```

---

## Part 4 — The Database Models

Each Mongoose model defines what gets stored in MongoDB. Think of each model as a table (collection in MongoDB).

### User
Who can log in to the system.

```
Fields: name, email (owner), username (staff), passwordHash, role
```

Owner logs in with email. Staff logs in with username. Both use bcrypt-hashed passwords. This model is ONLY for authentication — it does not represent gym clients.

### Member
The gym's actual clients.

```
Fields: gymId (GYM-XXXX), name, email, phone, plan, status, expiresAt, 
        checkedIn, lastCheckIn, balance, photoUrl, isActive
```

Hard duplicate blocking on name + email + phone — if you try to register someone who already exists, the backend rejects it. `balance` tracks unpaid amounts. `isActive` is false for deactivated members (soft delete — they're never truly deleted).

**Key: Member ≠ User.** A gym client is a Member. A staff employee or owner is a User. They are completely separate models with completely separate purposes.

### Payment
Every financial transaction.

```
Fields: gymId, memberName, method (cash/online), type (new_member/renewal/manual/balance_settlement),
        amountPaid, totalAmount, balance, isPartial, processedBy (ref→User), plan, notes
```

`isPartial: true` means the member paid less than the full amount. `balance` is what they still owe. `processedBy` links to the User (staff or owner) who recorded the payment — this is accountability.

### WalkIn
Day pass visitors.

```
Fields: walkId (WALK-XXX), name, passType (regular/student/couple), amount, 
        checkIn, checkOut, isCheckedOut, staffId, date
```

`walkId` resets every day — WALK-001 on Monday, WALK-001 again on Tuesday. The `date` field disambiguates them. This keeps IDs short and human-friendly for the kiosk.

### ActionLog
The complete audit trail of everything that happens.

```
Fields: action (enum), performedBy { userId, name, role }, 
        targetId, targetName, detail, timestamp
```

Two MongoDB indexes are on this collection:
- `{ timestamp: -1 }` — for fast "show me recent logs" queries
- `{ 'performedBy.userId': 1, timestamp: -1 }` — for fast "show me this staff member's logs" queries

Without these indexes, filtering 100,000 logs would scan every single document. With them, MongoDB jumps directly to the right records.

### Settings
The single source of truth for gym configuration.

```
Fields: gymName, gymAddress, logoUrl, plans[], walkInPrices
```

There is exactly ONE Settings document in the database. When the owner changes a plan price, all pages that use `gymStore.getPlanPrice()` will reflect it — because gymStore fetches from Settings on app load.

---

## Part 5 — The Zustand Stores (Global State)

Zustand is like a shared memory that all React components can read and write. When one component changes something in a store, every component watching that value re-renders automatically.

### authStore

```
State: user, token, isAuthenticated, _hasHydrated
Actions: setAuth(user, token), logout(), setHasHydrated(state)
```

`_hasHydrated` is critical. When the page loads, Zustand reads the stored auth from `localStorage`. But this is async. `_hasHydrated` starts as `false` and becomes `true` once the read completes. The `ProtectedRoute` component in `App.tsx` waits for `_hasHydrated` before deciding whether to redirect to login — otherwise a logged-in user would briefly flash to the login page on every refresh.

### gymStore

```
State: settings (gymName, address, logoUrl, plans[], walkInPrices), 
       isLoading, hasFetched, lastMemberUpdate

Actions: fetchGymInfo(), updateSettings(), setPlans(), setWalkInPrices(),
         triggerMemberRefresh()

Helpers: getActivePlans(), getPlanPrice(name), getPlanDuration(name), getWalkInPrice(type)
```

`hasFetched` prevents double-fetching. The store fetches settings once on app load and never again unless explicitly refreshed.

`lastMemberUpdate` + `triggerMemberRefresh()` is the cross-page refresh signal. When PaymentsPage logs a renewal that changes `expiresAt`, it calls `triggerMemberRefresh()`. MembersPage watches `lastMemberUpdate` with a `useEffect` and refetches when it changes. This is how two separate pages stay in sync without a global data fetching library.

### toastStore

```
State: toasts[]
Actions: showToast(message, type), removeToast(id)
```

`ToastContainer.tsx` is mounted in `App.tsx` via `createPortal` — it renders outside the normal React tree directly into `document.body`. This means toasts always appear on top of everything regardless of z-index stacking contexts.

---

## Part 6 — The Kiosk System

The kiosk is special because it's a public terminal with no login. It needs security without requiring a user account.

### How kiosk auth works

Instead of JWT (which requires login), the kiosk uses a shared secret:

```
Client sends:  X-Kiosk-Token: <VITE_KIOSK_SECRET>
Server checks: kioskAuth middleware compares against KIOSK_SECRET
```

The comparison is timing-safe (using `crypto.timingSafeEqual` via SHA-256 hashes) — this prevents attackers from timing the response to guess the secret character by character.

Both `KIOSK_SECRET` (server) and `VITE_KIOSK_SECRET` (client) must be the same value. They're set as environment variables — never hardcoded.

### Kiosk security layers

```
Request → kioskRateLimiter (20/min per IP) → kioskAuth (token check) → controller
```

Rate limiting blocks someone from hammering the member search endpoint to scrape all member names. The token check blocks anyone who isn't the kiosk terminal.

### Why kiosk uses raw fetch() not Axios

The Axios `api.ts` instance is configured to attach JWT tokens. The kiosk doesn't have a JWT — it has a kiosk token. Using the same Axios instance would conflict. So `KioskPage.tsx` uses raw `fetch()` with custom headers, completely separate from the rest of the app.

---

## Part 7 — The Action Log System

The action log is one of the most architecturally interesting parts of the system.

### The logAction() helper

```typescript
// server/src/utils/logAction.ts
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await ActionLog.create(params);
  } catch (err) {
    console.error('[logAction] Failed:', err);
    // Never rethrows — a logging failure must NEVER crash the real operation
  }
}
```

The `try/catch` that never rethrows is a deliberate design decision. If the database is slow and the log write fails, the check-in still succeeds. Logging is never more important than the real operation.

### Where logs are injected

Every controller calls `logAction()` after the main operation succeeds:

```
authController    → login, logout
memberController  → check_in, check_out, member_created, member_updated
paymentController → payment_created
walkInController  → walk_in_created, walk_in_checkout
kioskController   → NOT logged (no authenticated user)
```

The kiosk intentionally skips logging because there's no `req.user` — the kiosk is anonymous from the server's perspective.

### Server-side filtering

All log filtering happens in MongoDB, not in JavaScript:

```javascript
// actionLogsRoutes.ts
const filter = {};
if (role === 'staff') filter['performedBy.userId'] = userId;  // staff isolation
if (action) filter.action = action;
if (from || to) filter.timestamp = { $gte: toManilaStart(from), $lte: toManilaEnd(to) };

ActionLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit)
```

This works at 1,000 logs or 1,000,000 logs because MongoDB uses indexes. Client-side filtering would load all logs into memory — that would break at scale.

### Manila timezone handling

The server runs on UTC. The gym is in the Philippines (UTC+8). If a staff member filters "today", they mean Philippine midnight to Philippine midnight — not UTC midnight.

```javascript
const toManilaStart = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Manila midnight = 16:00 UTC previous day
  return new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
};
```

UTC+8 means Manila is 8 hours ahead. Manila midnight (00:00 +08:00) = UTC 16:00 the previous day. The `-8` in `Date.UTC` handles this.

---

## Part 8 — The Payment System

Payments are the most complex business logic in the system.

### Payment types

| Type                 | When used                                  | Updates expiresAt? |
|----------------------|--------------------------------------------|--------------------|
| `new_member`         | Auto-created when member registers         | Yes (initial)      |
| `renewal`            | Member extends membership                  | Yes                |
| `manual`             | Staff logs a payment without extending     | No                 |
| `balance_settlement` | Member pays off outstanding balance        | No                 |

### The expiry extension rule

```javascript
// paymentController.ts
const now = new Date();
const currentExpiry = member.expiresAt ? new Date(member.expiresAt) : now;
const baseDate = currentExpiry > now ? currentExpiry : now;
baseDate.setMonth(baseDate.getMonth() + months);
member.expiresAt = baseDate;
```

If the member's current expiry is April 25 and they renew for 1 month, the new expiry is May 25 — not March 25 + 1 month. Active members don't lose their remaining days. Expired members start fresh from today.

This same logic runs in the frontend `getNewExpiry()` function so the preview shown to staff matches what the backend will actually save.

### The duplicate payment guard

```javascript
const recentPayment = await Payment.findOne({
  gymId: member.gymId,
  type,
  createdAt: { $gte: new Date(Date.now() - 10000) }
});
if (recentPayment) return res.status(409).json({ message: 'Payment already processed.' });
```

This 10-second window catches double-taps on slow connections. If the same member has the same payment type within 10 seconds, the second one is rejected.

### Partial payments and balance tracking

If a member pays ₱500 for a ₱800 plan:
- `amountPaid: 500`
- `totalAmount: 800`
- `balance: 300`
- `isPartial: true`

The ₱300 balance is stored on both the `Payment` record and on `member.balance`. When the member later settles, `paymentController.settleBalance()` uses `member.balance` as the `totalAmount` — not the plan price. A settlement is paying off a debt, not buying a new plan.

---

## Part 9 — How Pages Are Organized

### Owner navigation

`OwnerDashboard.tsx` is not just the dashboard — it's the entire owner app. It uses `useSearchParams` to switch pages:

```
/dashboard         → shows DashboardContent
/dashboard?page=members  → shows MembersPage
/dashboard?page=payments → shows PaymentsPage
```

One URL, one component, multiple "pages" via query params. This is why the browser back button works — each page visit adds to browser history.

### Staff navigation

`StaffDashboard.tsx` works the same way. Staff see a subset of pages:
- Check-in desk, Walk-in desk, Members (read-only), Payments (today only), My Activity

`forceStaffView={true}` is passed to `PaymentsPage` when rendered inside StaffDashboard. This prop restricts the date range to today only — same component, different behavior.

### Public kiosk

`KioskPage.tsx` is at `/kiosk` — a completely separate route that doesn't use `OwnerLayout` or `StaffLayout`. No sidebar, no login required, no auth check. Just the kiosk UI.

---

## Part 10 — Security Layers

Every request to the backend passes through multiple security layers in order:

```
Request arrives
    ↓
1. Helmet — sets secure HTTP headers (XSS protection, clickjacking prevention)
    ↓
2. CORS — blocks requests from non-whitelisted origins
    ↓
3. Body size limit — rejects bodies larger than 10kb
    ↓
4. NoSQL sanitizer — strips $ and . from request bodies (injection prevention)
    ↓
5. HPP — prevents HTTP parameter pollution (?role=staff&role=owner)
    ↓
6. Input sanitizer — strips script tags and event handlers from strings
    ↓
7. General rate limiter — max 300 req per 15 min per IP (production)
    ↓
8. Security logger — logs auth attempts (never logs passwords)
    ↓
9. Route-specific middleware — protect (JWT check) or kioskAuth (token check)
    ↓
10. Controller — actual business logic
```

These layers are ordered intentionally. Cheap rejections (CORS, body size) happen before expensive ones (JWT verification, DB queries).

---

## Part 11 — File-by-File Reference

### Frontend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `App.tsx` | Root component. Defines all routes. Mounts `ToastContainer`. Fetches gym info on load. | Imports all pages, stores |
| `api.ts` | Central Axios instance. Attaches JWT on every request. Handles 401 → logout. | Used by every service file |
| `authStore.ts` | Stores logged-in user + token. Persists to localStorage. `logout()` logs before clearing. | Used by every protected component |
| `gymStore.ts` | Stores settings + plans. Plan price/duration helpers. Member refresh signal. | Used by PaymentsPage, MembersPage, KioskPage |
| `toastStore.ts` | Toast notification queue. | Used by every page that needs feedback |
| `memberService.ts` | All member API calls: getAll, create, update, checkIn, checkOut, renew, etc. | Uses api.ts |
| `paymentService.ts` | All payment API calls: create, settle, getSummary, getAll. | Uses api.ts |
| `walkInService.ts` | Walk-in API calls: register, checkout, getToday, getHistory. | Uses api.ts |
| `actionLogService.ts` | getLogs() with server-side filter params. | Uses api.ts |
| `kioskService.ts` | Not used — KioskPage uses raw fetch() directly. | N/A |
| `OwnerDashboard.tsx` | Full owner app. Switches pages via useSearchParams. Contains RenewModal. | Renders MembersPage, PaymentsPage, etc. |
| `StaffDashboard.tsx` | Full staff app. Check-in keyboard shortcut. Walk-in desk. forceStaffView on payments. | Same structure as OwnerDashboard |
| `MembersPage.tsx` | Member table. Add/edit drawer. Deactivate/reactivate. Settle balance modal. Watches lastMemberUpdate. | memberService, paymentService, gymStore |
| `PaymentsPage.tsx` | Payment table. Log Payment modal (type selector, settle shortcut, active-only search). | paymentService, memberService, gymStore |
| `KioskPage.tsx` | Public kiosk. Raw fetch() with X-Kiosk-Token. Auto-reset timer. Offline detection. | Direct fetch, no api.ts |
| `ActionLogPage.tsx` | Owner audit log. Server-side filters. Pagination. | actionLogService |
| `MyActivityPage.tsx` | Staff personal activity. Timeline grouped by day. Date presets. | actionLogService |

### Backend files

| File | What it does | Key connections |
|------|-------------|-----------------|
| `index.ts` | Server entry. Mounts all middleware and routes. Initializes DB. Creates default Settings. | Imports everything |
| `db.ts` | Connects to MongoDB Atlas. Stops server if connection fails. | Called from index.ts |
| `security.ts` | Exports helmetMiddleware, generalRateLimiter, authRateLimiter, kioskRateLimiter, corsOptions, sanitizers. | Used in index.ts |
| `authMiddleware.ts` | `protect()` — verifies JWT, attaches req.user. `requireRole()` — blocks wrong roles. | Used in all protected routes |
| `kioskAuth.ts` | Verifies X-Kiosk-Token with timing-safe comparison. Throws on startup if KIOSK_SECRET missing. | Used in kioskRoutes.ts |
| `authController.ts` | login (owner + staff), register, gym-info (public), settings CRUD. logAction() on all mutations. | User model, Settings model, logAction |
| `memberController.ts` | GYM-ID generation, getMembers, createMember, updateMember, checkIn, checkOut, deactivate, reactivate. | Member model, logAction, autoLogPayment |
| `paymentController.ts` | createPayment (expiry extension logic), settleBalance, getPayments, getPaymentSummary, autoLogPayment. Settings cached per request. | Payment model, Member model, Settings model, logAction |
| `walkInController.ts` | WALK-XXX daily reset, register walk-in, staff checkout, kiosk checkout. logAction on register + staff checkout. | WalkIn model, Settings model, logAction |
| `kioskController.ts` | kioskSearch, kioskMemberCheckIn, kioskMemberCheckOut, kioskWalkInLookup, kioskWalkInCheckOut. No logAction (no req.user). | Member model, WalkIn model |
| `logAction.ts` | Writes ActionLog document. try/catch that never rethrows. | ActionLog model |
| `Member.ts` | Mongoose schema. Indexes on gymId, name, email, phone. | Used in memberController, kioskController |
| `Payment.ts` | Mongoose schema. | Used in paymentController |
| `WalkIn.ts` | Mongoose schema. Compound index on {walkId, date} for daily reset queries. | Used in walkInController |
| `ActionLog.ts` | Mongoose schema. Two indexes for fast filtering. | Used in logAction, actionLogsRoutes |
| `Settings.ts` | Mongoose schema. One document only. Default plans + walkInPrices on first startup. | Used in multiple controllers |

---

## Part 12 — Common Patterns to Recognize

Once you recognize these patterns, reading any file becomes much faster.

### The service + controller pattern
Frontend calls a service function → service calls `api.get/post/patch` → Axios adds the token → Express route receives it → middleware validates → controller does work → response returns → service returns data → component updates UI.

### The fire-and-forget log
Every controller ends with `await logAction(...)` but if that fails, it doesn't matter. The operation already succeeded. Logging is secondary.

### The `forceStaffView` prop
When the same component needs different behavior for different roles, a boolean prop controls it. No code duplication, just conditional logic inside one component.

### The settings cache pattern
`paymentController.ts` calls `Settings.findOne()` once at the start of the request and passes it to helper functions. The helpers accept an optional `settingsCache` parameter so they don't re-query. This avoids 3-4 database round trips per payment.

### The cross-page refresh signal
When one page changes data that another page displays, use `gymStore.triggerMemberRefresh()` to set a timestamp, and `useEffect(() => { fetch(); }, [lastMemberUpdate])` in the receiving page. No prop drilling, no global query invalidation library needed.

### The inline-flow modal
Search results inside modals used to be `position: absolute` which breaks layout when the modal scrolls. The fix: render results as normal block elements below the input. They push content down instead of overlapping it.

---

## Part 13 — What to Read First

If you're new to this codebase, read files in this order:

1. `shared/types.ts` — learn the data shapes first. Everything else refers to these.
2. `client/src/services/api.ts` — understand how the frontend talks to the backend.
3. `server/src/middleware/authMiddleware.ts` — understand how protection works.
4. `server/src/controllers/memberController.ts` — the most complete example of controller patterns.
5. `server/src/utils/logAction.ts` — small but important.
6. `client/src/store/authStore.ts` + `gymStore.ts` — understand global state.
7. `client/src/pages/OwnerDashboard.tsx` — see how all the pieces connect in a real page.
8. `server/src/index.ts` — see how all middleware and routes are assembled.

Then pick any feature and trace it end-to-end: frontend button → service → api.ts → route → middleware → controller → model → logAction → response → UI update.

---

*GMS Architecture Deep-Dive — March 2026*
