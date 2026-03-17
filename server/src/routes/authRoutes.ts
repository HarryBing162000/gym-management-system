import { Router } from "express";
import {
  registerOwner,
  registerStaff,
  registerMember,
  loginOwner,
  loginStaff,
  getMe,
} from "../controllers/authController";
import { validate } from "../middleware/validate";
import {
  registerOwnerSchema,
  registerStaffSchema,
  registerMemberSchema,
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

router.post(
  "/register/member",
  authRateLimiter,
  protect,
  requireRole("owner", "staff"), // owner or staff can register members
  validate(registerMemberSchema),
  registerMember,
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

export default router;
