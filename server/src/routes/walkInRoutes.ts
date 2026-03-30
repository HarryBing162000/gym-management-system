import { Router } from "express";
import { runAutoCheckout } from "../utils/autoCheckout";
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

// Owner-only manual trigger — runs the same logic as the cron job immediately
// Useful if the owner wants to close early or the cron missed for any reason
router.post(
  "/auto-checkout",
  protect,
  requireRole("owner"),
  async (req, res) => {
    try {
      const result = await runAutoCheckout();
      return res.status(200).json({
        success: true,
        message:
          result.checkedOut > 0
            ? `${result.checkedOut} walk-in${result.checkedOut !== 1 ? "s" : ""} checked out at ${result.closingTime}.`
            : "No open walk-ins to check out.",
        ...result,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },
);

export default router;
