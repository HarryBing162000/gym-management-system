"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const validate_1 = require("../middleware/validate");
const authSchemas_1 = require("../middleware/authSchemas");
const memberController_1 = require("../controllers/memberController");
const router = (0, express_1.Router)();
// ── All routes require a valid JWT ───────────────────────────────────────────
router.use(authMiddleware_1.protect);
// ── Owner + Staff ─────────────────────────────────────────────────────────────
// GET /api/members?status=active&plan=Monthly&search=juan&page=1&limit=20
router.get("/", (0, authMiddleware_1.requireRole)("owner", "staff"), memberController_1.getMembers);
// GET /api/members/:gymId
router.get("/:gymId", (0, authMiddleware_1.requireRole)("owner", "staff"), (0, validate_1.validateParams)(authSchemas_1.gymIdParamSchema), memberController_1.getMemberByGymId);
// POST /api/members
router.post("/", (0, authMiddleware_1.requireRole)("owner", "staff"), (0, validate_1.validate)(authSchemas_1.createMemberSchema), memberController_1.createMember);
// PATCH /api/members/:gymId
router.patch("/:gymId", (0, authMiddleware_1.requireRole)("owner", "staff"), (0, validate_1.validateParams)(authSchemas_1.gymIdParamSchema), (0, validate_1.validate)(authSchemas_1.updateMemberSchema), memberController_1.updateMember);
// ── Owner only ────────────────────────────────────────────────────────────────
// PATCH /api/members/:gymId/deactivate
router.patch("/:gymId/deactivate", (0, authMiddleware_1.requireRole)("owner"), (0, validate_1.validateParams)(authSchemas_1.gymIdParamSchema), memberController_1.deactivateMember);
// PATCH /api/members/:gymId/reactivate
router.patch("/:gymId/reactivate", (0, authMiddleware_1.requireRole)("owner"), (0, validate_1.validateParams)(authSchemas_1.gymIdParamSchema), memberController_1.reactivateMember);
// PATCH /api/members/:gymId/checkin — owner + staff
router.patch("/:gymId/checkin", (0, authMiddleware_1.requireRole)("owner", "staff"), (0, validate_1.validateParams)(authSchemas_1.gymIdParamSchema), memberController_1.checkInMember);
// PATCH /api/members/:gymId/checkout — owner + staff
router.patch("/:gymId/checkout", (0, authMiddleware_1.requireRole)("owner", "staff"), (0, validate_1.validateParams)(authSchemas_1.gymIdParamSchema), memberController_1.checkOutMember);
exports.default = router;
