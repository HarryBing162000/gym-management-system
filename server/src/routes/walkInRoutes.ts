import { Router } from "express";
import {
  registerWalkIn,
  checkOutWalkIn,
  getTodayWalkIns,
  kioskCheckOut,
} from "../controllers/walkInController";
import { validate } from "../middleware/validate";
import { walkInSchema, walkInCheckOutSchema } from "../middleware/authSchemas";
import { protect, requireRole } from "../middleware/authMiddleware";

const router = Router();

// Staff/Owner registers a walk-in at the counter
router.post(
  "/register",
  protect,
  requireRole("owner", "staff"),
  validate(walkInSchema),
  registerWalkIn,
);

// Staff/Owner checks out a walk-in
router.patch(
  "/checkout",
  protect,
  requireRole("owner", "staff"),
  validate(walkInCheckOutSchema),
  checkOutWalkIn,
);

// View today's walk-ins + revenue summary
router.get("/today", protect, requireRole("owner", "staff"), getTodayWalkIns);

// PUBLIC — kiosk self checkout (no login needed)
router.post("/kiosk-checkout", validate(walkInCheckOutSchema), kioskCheckOut);

export default router;
