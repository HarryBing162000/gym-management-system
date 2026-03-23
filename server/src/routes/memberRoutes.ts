/**
 * memberRoutes.ts
 * IronCore GMS — Member Management Router
 *
 * All routes require JWT authentication (protect).
 * Role enforcement per route:
 *   owner + staff → list, view, create, update
 *   owner only    → deactivate, reactivate
 *   member role   → blocked from all routes here
 */

import { Router } from "express";
import { protect, requireRole } from "../middleware/authMiddleware";
import { validate, validateParams } from "../middleware/validate";
import {
  createMemberSchema,
  updateMemberSchema,
  gymIdParamSchema,
} from "../middleware/authSchemas";
import {
  getMembers,
  getMemberByGymId,
  getMemberStats,
  getAtRiskMembers,
  createMember,
  updateMember,
  deactivateMember,
  reactivateMember,
  checkInMember,
  checkOutMember,
} from "../controllers/memberController";

const router = Router();

// ── All routes require a valid JWT ───────────────────────────────────────────
router.use(protect);

// ── Owner + Staff ─────────────────────────────────────────────────────────────

// GET /api/members?status=active&plan=Monthly&search=juan&page=1&limit=20
router.get("/", requireRole("owner", "staff"), getMembers);

// GET /api/members/stats — dashboard summary (owner + staff)
router.get("/stats", requireRole("owner", "staff"), getMemberStats);

// GET /api/members/at-risk — expiring/overdue members (owner + staff)
router.get("/at-risk", requireRole("owner", "staff"), getAtRiskMembers);

// GET /api/members/:gymId
router.get(
  "/:gymId",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  getMemberByGymId,
);

// POST /api/members
router.post(
  "/",
  requireRole("owner", "staff"),
  validate(createMemberSchema),
  createMember,
);

// PATCH /api/members/:gymId
router.patch(
  "/:gymId",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  validate(updateMemberSchema),
  updateMember,
);

// ── Owner only ────────────────────────────────────────────────────────────────

// PATCH /api/members/:gymId/deactivate
router.patch(
  "/:gymId/deactivate",
  requireRole("owner"),
  validateParams(gymIdParamSchema),
  deactivateMember,
);

// PATCH /api/members/:gymId/reactivate
router.patch(
  "/:gymId/reactivate",
  requireRole("owner"),
  validateParams(gymIdParamSchema),
  reactivateMember,
);

// PATCH /api/members/:gymId/checkin — owner + staff
router.patch(
  "/:gymId/checkin",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  checkInMember,
);

// PATCH /api/members/:gymId/checkout — owner + staff
router.patch(
  "/:gymId/checkout",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  checkOutMember,
);

export default router;
