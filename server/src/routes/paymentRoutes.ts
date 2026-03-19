import { Router } from "express";
import { protect, requireRole } from "../middleware/authMiddleware";
import {
  getPayments,
  getPaymentSummary,
  createPayment,
  settleBalance,
} from "../controllers/paymentController";

const router = Router();
router.use(protect);

router.get("/summary", requireRole("owner", "staff"), getPaymentSummary);
router.get("/", requireRole("owner", "staff"), getPayments);
router.post("/", requireRole("owner", "staff"), createPayment);
router.post("/:gymId/settle", requireRole("owner", "staff"), settleBalance);

export default router;
