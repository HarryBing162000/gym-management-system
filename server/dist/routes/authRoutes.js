"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const validate_1 = require("../middleware/validate");
const authSchemas_1 = require("../middleware/authSchemas");
const authMiddleware_1 = require("../middleware/authMiddleware");
const security_1 = require("../middleware/security");
const router = (0, express_1.Router)();
// ── Register routes ──────────────────────────────────────
router.post("/register/owner", security_1.authRateLimiter, (0, validate_1.validate)(authSchemas_1.registerOwnerSchema), authController_1.registerOwner);
router.post("/register/staff", security_1.authRateLimiter, authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), // only owner can create staff accounts
(0, validate_1.validate)(authSchemas_1.registerStaffSchema), authController_1.registerStaff);
// ── Login routes ─────────────────────────────────────────
router.post("/login/owner", security_1.authRateLimiter, (0, validate_1.validate)(authSchemas_1.loginOwnerSchema), authController_1.loginOwner);
router.post("/login/staff", security_1.authRateLimiter, (0, validate_1.validate)(authSchemas_1.loginStaffSchema), authController_1.loginStaff);
// ── Protected ────────────────────────────────────────────
router.get("/me", authMiddleware_1.protect, authController_1.getMe);
// ── Staff management (owner only) ────────────────────────
router.get("/staff", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.listStaff);
router.patch("/staff/:id/deactivate", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.deactivateStaff);
router.patch("/staff/:id/reactivate", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.reactivateStaff);
exports.default = router;
