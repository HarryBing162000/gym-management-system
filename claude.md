# LakasGMS — CLAUDE.md (System Rules)

You are working on a production-grade multi-tenant Gym Management System.

Your job is to write SAFE, CORRECT, and CONSISTENT code.

If uncertain → ASK. Never guess.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 1. CRITICAL NON-NEGOTIABLE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1.1 Multi-Tenant Enforcement (HIGHEST PRIORITY)

ALL database queries MUST include:

    { ownerId: req.user!.ownerId }

Applies to:
- Member
- Payment
- WalkIn
- ActionLog
- Settings

❌ NEVER:
    Model.find({})
    Model.findOne({})
    Model.updateMany({})

✅ ALWAYS:
    Model.find({ ownerId })
    Model.findOne({ ownerId })

Violation = DATA LEAK = CRITICAL FAILURE


### 1.2 ownerId Source of Truth

Owner:
    req.user.id

Staff:
    req.user.ownerId

Kiosk:
    req.kioskOwnerId

Always resolve correct ownerId BEFORE query.


### 1.3 Settings Rule (STRICT)

- ONE Settings document per owner
- ALWAYS queried with ownerId

❌ NEVER:
    upsert: true
    global Settings

If Settings missing:
    → THROW ERROR (do NOT create silently)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 2. AUTH & SECURITY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JWT Payload:

    { id, role, name }

Middleware: `protect`

MUST:
- Verify token
- Fetch user
- Check:
    - user.isActive === true
    - GymClient.status !== "suspended"

If failed → return 401 immediately


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏗️ 3. BACKEND RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 3.1 Query Safety

- Always scoped
- Always validated
- Always typed

### 3.2 ObjectId Usage

If schema expects ObjectId:
    MUST use ObjectId

❌ NEVER store string IDs


### 3.3 Call Chain Integrity

If you change:
    - controller
    - service
    - function signature

You MUST update ALL callers.


### 3.4 No Assumptions

If missing:
- types
- schema
- file context

→ ASK before coding


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚛️ 4. FRONTEND RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 4.1 React Hook Order (STRICT)

Always:

    useState
    computed values
    useCallback
    useEffect

❌ NEVER reference variable before declaration


### 4.2 Imports

Everything used MUST be imported.


### 4.3 State Access

Use:

    gymStore.getOwnerId()
    gymStore.getTimezone()

❌ NEVER hardcode:
    ownerId
    timezone


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌍 5. TIMEZONE SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Source of truth:

    Settings.timezone

Backend:
    Read from DB

Frontend:
    use gymStore.getTimezone()

❌ NEVER hardcode:
    "Asia/Manila"


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 6. DATA MODELS (MENTAL MODEL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User:
    owner → no ownerId
    staff → has ownerId

Member:
    scoped by ownerId

WalkIn:
    scoped by ownerId
    WALK-XXX (daily reset)

Payment:
    scoped by ownerId
    processedBy = ObjectId

Settings:
    ONE per owner
    REQUIRED
    scoped by ownerId


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧩 7. KIOSK SYSTEM RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Auth:
    X-Kiosk-Token
    X-Gym-Id

NO JWT

Queries MUST use:

    { ownerId: req.kioskOwnerId }


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 8. COMMON FAILURES (NEVER DO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Missing ownerId in queries
❌ Global queries
❌ upsert on Settings
❌ Hardcoded timezone
❌ String instead of ObjectId
❌ Broken hook order
❌ Ignoring call chain updates
❌ Guessing missing logic


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 9. ENGINEERING BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You must think like a SENIOR ENGINEER:

- Validate before coding
- Trace full flow (frontend → backend → DB)
- Enforce data isolation
- Prefer safety over speed
- Do not shortcut critical rules

If unsure:
    → ASK FIRST
    → DO NOT INVENT LOGIC

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
