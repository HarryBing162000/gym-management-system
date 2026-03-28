/**
 * superAdminRoutes.ts
 * GMS — Super Admin Routes
 *
 * All routes under /api/superadmin
 * Login is public. Everything else requires protectSuperAdmin.
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
} from "../controllers/superAdminController";

const router = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.post("/login", superAdminLogin);

// ─── Protected — all require valid super admin JWT ────────────────────────────
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

export default router;
