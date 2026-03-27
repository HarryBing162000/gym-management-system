"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const validate_1 = require("../middleware/validate");
const authSchemas_1 = require("../middleware/authSchemas");
const authMiddleware_1 = require("../middleware/authMiddleware");
const security_1 = require("../middleware/security");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// ── Register routes ──────────────────────────────────────
router.post("/register/owner", security_1.authRateLimiter, (0, validate_1.validate)(authSchemas_1.registerOwnerSchema), authController_1.registerOwner);
router.post("/register/staff", security_1.authRateLimiter, authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), (0, validate_1.validate)(authSchemas_1.registerStaffSchema), authController_1.registerStaff);
// ── Login routes ─────────────────────────────────────────
router.post("/login/owner", security_1.authRateLimiter, (0, validate_1.validate)(authSchemas_1.loginOwnerSchema), authController_1.loginOwner);
router.post("/login/staff", security_1.authRateLimiter, (0, validate_1.validate)(authSchemas_1.loginStaffSchema), authController_1.loginStaff);
// ── Protected ────────────────────────────────────────────
router.get("/me", authMiddleware_1.protect, authController_1.getMe);
// ── Staff management (owner only) ────────────────────────
router.get("/staff", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.listStaff);
router.patch("/staff/:id/deactivate", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.deactivateStaff);
router.patch("/staff/:id/reactivate", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.reactivateStaff);
// ── Owner Settings (owner only) ───────────────────────────
router.put("/update-password", authMiddleware_1.protect, (0, validate_1.validate)(authSchemas_1.updatePasswordSchema), authController_1.updatePassword);
router.put("/update-email", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), (0, validate_1.validate)(authSchemas_1.updateEmailSchema), authController_1.updateEmail);
router.put("/update-gym", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), (0, validate_1.validate)(authSchemas_1.updateGymSchema), authController_1.updateGym);
// ── Gym Info (public — login page and kiosk need this) ────
router.get("/gym-info", authController_1.getGymInfo);
// ── Logo Upload (owner only) ──────────────────────────────
router.post("/upload-logo", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), upload_1.uploadLogo.single("logo"), authController_1.uploadLogoController);
router.delete("/delete-logo", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.deleteLogo);
// ── Plan Management (owner only) ─────────────────────────
router.get("/plans", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.getPlans);
router.post("/plans", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.addPlan);
router.patch("/plans/:planId", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.updatePlan);
router.delete("/plans/:planId", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.deletePlan);
// ── Walk-in Prices (owner only) ──────────────────────────
router.put("/walkin-prices", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), authController_1.updateWalkInPrices);
exports.default = router;
