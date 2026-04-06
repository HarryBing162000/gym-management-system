/**
 * kioskRoutes.ts
 * LakasGMS — Public Kiosk Router
 *
 * All routes here are:
 *   1. Rate-limited  (kioskRateLimiter — 20 req/min per IP)
 *   2. Token-gated   (kioskAuth — X-Kiosk-Token header required)
 *
 * No JWT auth. This is a public terminal, not a user session.
 * The kioskAuth middleware provides machine-level security instead.
 */

import { Router } from "express";
import { kioskAuth } from "../middleware/kioskAuth";
import { kioskRateLimiter } from "../middleware/security";
import {
  kioskSearch,
  kioskMemberCheckIn,
  kioskMemberCheckOut,
  kioskWalkInLookup,
  kioskWalkInCheckOut,
} from "../controllers/kioskController";

const router = Router();

// ── Security — applies to ALL kiosk routes ───────────────────────────────────
// Order matters: rate limit first (cheap), then token check (slightly heavier)
router.use(kioskRateLimiter);
router.use(kioskAuth);

// ── Member routes ─────────────────────────────────────────────────────────────
router.get("/search", kioskSearch); // GET  /api/kiosk/search?q=
router.post("/member/checkin", kioskMemberCheckIn); // POST /api/kiosk/member/checkin
router.post("/member/checkout", kioskMemberCheckOut); // POST /api/kiosk/member/checkout

// ── Walk-in routes ────────────────────────────────────────────────────────────
// Note: /walkin/checkout must be defined BEFORE /walkin/:walkId
// otherwise Express will match "checkout" as the :walkId param
router.post("/walkin/checkout", kioskWalkInCheckOut); // POST /api/kiosk/walkin/checkout
router.get("/walkin/:walkId", kioskWalkInLookup); // GET  /api/kiosk/walkin/:walkId

export default router;
