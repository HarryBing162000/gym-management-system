/**
 * memberRoutes.ts
 *
 * All routes require JWT authentication (protect).
 * Role enforcement per route:
 *   owner + staff → list, view, create, update, stats
 *   owner only    → deactivate, reactivate, at-risk
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
  getMemberStats,
  getAtRiskMembers,
  getMemberByGymId,
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

// ── Named routes MUST come before /:gymId — otherwise Express matches
//    "stats" and "at-risk" as a gymId param ──────────────────────────────────
router.get("/stats", requireRole("owner", "staff"), getMemberStats);
router.get("/at-risk", requireRole("owner"), getAtRiskMembers);

// ── Owner + Staff ─────────────────────────────────────────────────────────────
router.get("/", requireRole("owner", "staff"), getMembers);
router.get(
  "/:gymId",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  getMemberByGymId,
);
router.post(
  "/",
  requireRole("owner", "staff"),
  validate(createMemberSchema),
  createMember,
);
router.patch(
  "/:gymId",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  validate(updateMemberSchema),
  updateMember,
);

// ── Owner only ────────────────────────────────────────────────────────────────
router.patch(
  "/:gymId/deactivate",
  requireRole("owner"),
  validateParams(gymIdParamSchema),
  deactivateMember,
);
router.patch(
  "/:gymId/reactivate",
  requireRole("owner"),
  validateParams(gymIdParamSchema),
  reactivateMember,
);

// ── Owner + Staff ─────────────────────────────────────────────────────────────
router.patch(
  "/:gymId/checkin",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  checkInMember,
);
router.patch(
  "/:gymId/checkout",
  requireRole("owner", "staff"),
  validateParams(gymIdParamSchema),
  checkOutMember,
);

export default router;
