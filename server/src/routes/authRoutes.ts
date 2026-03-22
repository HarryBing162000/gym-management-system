import { Router } from "express";
import {
  registerOwner,
  registerStaff,
  loginOwner,
  loginStaff,
  getMe,
  listStaff,
  deactivateStaff,
  reactivateStaff,
  updatePassword,
  updateEmail,
  updateGym,
  getGymInfo,
  uploadLogoController,
  deleteLogo,
  getPlans,
  addPlan,
  updatePlan,
  deletePlan,
  updateWalkInPrices,
} from "../controllers/authController";
import { validate } from "../middleware/validate";
import {
  registerOwnerSchema,
  registerStaffSchema,
  loginOwnerSchema,
  loginStaffSchema,
  updatePasswordSchema,
  updateEmailSchema,
  updateGymSchema,
} from "../middleware/authSchemas";
import { protect, requireRole } from "../middleware/authMiddleware";
import { authRateLimiter } from "../middleware/security";
import { uploadLogo } from "../middleware/upload";

const router = Router();

// ── Register routes ──────────────────────────────────────
router.post(
  "/register/owner",
  authRateLimiter,
  validate(registerOwnerSchema),
  registerOwner,
);

router.post(
  "/register/staff",
  authRateLimiter,
  protect,
  requireRole("owner"),
  validate(registerStaffSchema),
  registerStaff,
);

// ── Login routes ─────────────────────────────────────────
router.post(
  "/login/owner",
  authRateLimiter,
  validate(loginOwnerSchema),
  loginOwner,
);

router.post(
  "/login/staff",
  authRateLimiter,
  validate(loginStaffSchema),
  loginStaff,
);

// ── Protected ────────────────────────────────────────────
router.get("/me", protect, getMe);

// ── Staff management (owner only) ────────────────────────
router.get("/staff", protect, requireRole("owner"), listStaff);
router.patch(
  "/staff/:id/deactivate",
  protect,
  requireRole("owner"),
  deactivateStaff,
);
router.patch(
  "/staff/:id/reactivate",
  protect,
  requireRole("owner"),
  reactivateStaff,
);

// ── Owner Settings (owner only) ───────────────────────────
router.put(
  "/update-password",
  protect,
  validate(updatePasswordSchema),
  updatePassword,
);

router.put(
  "/update-email",
  protect,
  requireRole("owner"),
  validate(updateEmailSchema),
  updateEmail,
);

router.put(
  "/update-gym",
  protect,
  requireRole("owner"),
  validate(updateGymSchema),
  updateGym,
);

// ── Gym Info (public — login page and kiosk need this) ────
router.get("/gym-info", getGymInfo);

// ── Logo Upload (owner only) ──────────────────────────────
router.post(
  "/upload-logo",
  protect,
  requireRole("owner"),
  uploadLogo.single("logo"),
  uploadLogoController,
);

router.delete("/delete-logo", protect, requireRole("owner"), deleteLogo);

// ── Plan Management (owner only) ─────────────────────────
router.get("/plans", protect, requireRole("owner"), getPlans);
router.post("/plans", protect, requireRole("owner"), addPlan);
router.patch("/plans/:planId", protect, requireRole("owner"), updatePlan);
router.delete("/plans/:planId", protect, requireRole("owner"), deletePlan);

// ── Walk-in Prices (owner only) ──────────────────────────
router.put("/walkin-prices", protect, requireRole("owner"), updateWalkInPrices);

export default router;
