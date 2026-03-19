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
} from "../controllers/authController";
import { validate } from "../middleware/validate";
import {
  registerOwnerSchema,
  registerStaffSchema,
  loginOwnerSchema,
  loginStaffSchema,
} from "../middleware/authSchemas";
import { protect, requireRole } from "../middleware/authMiddleware";
import { authRateLimiter } from "../middleware/security";

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
  requireRole("owner"), // only owner can create staff accounts
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

export default router;
