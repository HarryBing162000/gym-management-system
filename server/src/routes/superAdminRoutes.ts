/**
 * superAdminRoutes.ts
 * LakasGMS — Super Admin Routes
 */

import { Router } from "express";
import { protectSuperAdmin } from "../middleware/superAdminMiddleware";
import {
  superAdminLogin,
  listGyms,
  createGym,
  getGym,
  updateGym,
  suspendGym,
  reactivateGym,
  deleteGym,
  hardDeleteGym,
  resetOwnerPassword,
  resendInvite,
  impersonateGym,
  exchangeImpersonate,
  getAuditLog,
} from "../controllers/superAdminController";

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.post("/login", superAdminLogin);

// Exchange endpoint — public, impersonation token IS the credential
router.post("/exchange-impersonate", exchangeImpersonate);

// ─── Protected ────────────────────────────────────────────────────────────────
router.use(protectSuperAdmin);

router.get("/gyms", listGyms);
router.post("/gyms", createGym);
router.get("/gyms/:id", getGym);
router.patch("/gyms/:id", updateGym);
router.patch("/gyms/:id/suspend", suspendGym);
router.patch("/gyms/:id/reactivate", reactivateGym);
router.delete("/gyms/:id", deleteGym);
router.delete("/gyms/:id/hard-delete", hardDeleteGym);
router.post("/gyms/:id/reset-password", resetOwnerPassword);
router.post("/gyms/:id/resend-invite", resendInvite);
router.post("/gyms/:id/impersonate", impersonateGym);
router.get("/audit-log", getAuditLog);

export default router;
