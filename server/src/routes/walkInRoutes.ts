import { Router } from "express";
import {
  registerWalkIn,
  checkOutWalkIn,
  getTodayWalkIns,
  getWalkInHistory,
  getYesterdayRevenue,
  kioskCheckOut,
} from "../controllers/walkInController";
import { validate } from "../middleware/validate";
import { walkInSchema, walkInCheckOutSchema } from "../middleware/authSchemas";
import { protect, requireRole } from "../middleware/authMiddleware";

const router = Router();

// Staff/Owner registers a walk-in
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

// Today's walk-ins + summary
router.get("/today", protect, requireRole("owner", "staff"), getTodayWalkIns);

// History by date or range — owner only
router.get("/history", protect, requireRole("owner"), getWalkInHistory);

// Yesterday revenue — for comparison card
router.get(
  "/yesterday-revenue",
  protect,
  requireRole("owner"),
  getYesterdayRevenue,
);

// Public kiosk self-checkout
router.post("/kiosk-checkout", validate(walkInCheckOutSchema), kioskCheckOut);

export default router;
