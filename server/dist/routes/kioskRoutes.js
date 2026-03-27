"use strict";
/**
 * kioskRoutes.ts
 * IronCore GMS — Public Kiosk Router
 *
 * All routes here are:
 *   1. Rate-limited  (kioskRateLimiter — 20 req/min per IP)
 *   2. Token-gated   (kioskAuth — X-Kiosk-Token header required)
 *
 * No JWT auth. This is a public terminal, not a user session.
 * The kioskAuth middleware provides machine-level security instead.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const kioskAuth_1 = require("../middleware/kioskAuth");
const security_1 = require("../middleware/security");
const kioskController_1 = require("../controllers/kioskController");
const router = (0, express_1.Router)();
// ── Security — applies to ALL kiosk routes ───────────────────────────────────
// Order matters: rate limit first (cheap), then token check (slightly heavier)
router.use(security_1.kioskRateLimiter);
router.use(kioskAuth_1.kioskAuth);
// ── Member routes ─────────────────────────────────────────────────────────────
router.get("/search", kioskController_1.kioskSearch); // GET  /api/kiosk/search?q=
router.post("/member/checkin", kioskController_1.kioskMemberCheckIn); // POST /api/kiosk/member/checkin
router.post("/member/checkout", kioskController_1.kioskMemberCheckOut); // POST /api/kiosk/member/checkout
// ── Walk-in routes ────────────────────────────────────────────────────────────
// Note: /walkin/checkout must be defined BEFORE /walkin/:walkId
// otherwise Express will match "checkout" as the :walkId param
router.post("/walkin/checkout", kioskController_1.kioskWalkInCheckOut); // POST /api/kiosk/walkin/checkout
router.get("/walkin/:walkId", kioskController_1.kioskWalkInLookup); // GET  /api/kiosk/walkin/:walkId
exports.default = router;
